import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { JsonSyntaxError } from '../src/errors.js';
import { tryParse } from '../src/parser.js';
import { QueryError } from '../src/query.js';
import { DEMO, SAMPLES } from '../src/samples.js';
import { createDemoWorkspace, createWorkspace, MODES, TABS } from '../src/workspace.js';

const NESTED = '{"a": {"b": {"c": 1}}, "d": 2}';

const rowPaths = (workspace) => workspace.rows().map((row) => row.node.path);
const outputText = (workspace) => workspace.output()?.text ?? null;

describe('createWorkspace', () => {
  it('starts empty with the default settings', () => {
    const workspace = createWorkspace();
    assert.deepStrictEqual(workspace.getState(), {
      input: '',
      compare: '',
      query: '',
      relaxed: false,
      indent: 2,
      sortKeys: false,
      mode: 'pretty',
      tab: 'formatted',
      status: 'empty',
      error: null,
      repairs: [],
      stale: false,
      hasDocument: false,
    });
    assert.equal(workspace.output(), null);
    assert.deepStrictEqual(workspace.rows(), []);
    assert.deepStrictEqual(workspace.diff(), { status: 'empty' });
    assert.equal(workspace.queryResult(), null);
    assert.deepStrictEqual([MODES, TABS], [['pretty', 'minify'], ['formatted', 'tree', 'diff']]);
  });

  it('formats the document with the chosen indent, mode and key order', () => {
    const workspace = createWorkspace({ input: '{"b": 1, "a": [1, 2]}' });
    assert.deepStrictEqual([workspace.getState().status, workspace.getState().hasDocument], ['valid', true]);
    assert.equal(outputText(workspace), '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
    workspace.update({ sortKeys: true });
    assert.equal(outputText(workspace), '{\n  "a": [\n    1,\n    2\n  ],\n  "b": 1\n}');
    workspace.update({ mode: 'minify' });
    assert.equal(outputText(workspace), '{"a":[1,2],"b":1}');
    workspace.update({ mode: 'pretty', sortKeys: false, indent: 'tab' });
    assert.equal(outputText(workspace), '{\n\t"b": 1,\n\t"a": [\n\t\t1,\n\t\t2\n\t]\n}');
    workspace.update({ indent: 4 });
    const { text, segments } = workspace.output();
    assert.equal(text, '{\n    "b": 1,\n    "a": [\n        1,\n        2\n    ]\n}');
    assert.equal(segments.map((segment) => segment.text).join(''), text);
  });

  it('ignores invalid settings', () => {
    const workspace = createWorkspace({ input: '[1]', indent: 3, mode: 'tiny' });
    const before = workspace.getState();
    assert.deepStrictEqual([before.indent, before.mode], [2, 'pretty']);
    workspace.update({ indent: 0, mode: 'tiny', tab: 'nope', relaxed: 'yes', sortKeys: 1, input: 42, query: null, compare: [] });
    workspace.update({ toString: 'x', ...JSON.parse('{"__proto__": {"indent": 4}}') });
    assert.deepStrictEqual(workspace.getState(), before);
    assert.equal(Object.prototype.indent, undefined);
  });

  it('treats blank input as empty', () => {
    const workspace = createWorkspace({ input: '[1]' });
    workspace.update({ input: ' \r\n\t ' });
    assert.deepStrictEqual(pick(workspace.getState(), 'status', 'stale', 'hasDocument'), ['empty', false, false]);
    assert.equal(workspace.output(), null);
  });

  it('reports invisible characters that are not JSON whitespace instead of treating them as blank', () => {
    const cases = [
      [' ', 1, 1, 'U+00A0'],
      ['﻿', 1, 1, 'U+FEFF'],
      ['\n ', 2, 1, 'U+2028'],
    ];
    for (const [input, line, column, found] of cases) {
      const state = createWorkspace({ input }).getState();
      assert.equal(state.status, 'invalid', found);
      assert.deepStrictEqual(pick(state.error, 'code', 'line', 'column', 'found'), ['unexpected-token', line, column, found]);
    }
    const workspace = createWorkspace({ input: '[1]', compare: ' ', query: ' ' });
    assert.equal(workspace.diff().status, 'invalid');
    assert.equal(workspace.queryResult().ok, false);
  });

  it('keeps showing the last valid document while the input has an error', () => {
    const workspace = createWorkspace({ input: '[1, 2]' });
    const before = workspace.output();
    workspace.update({ input: '[1, 2' });
    const state = workspace.getState();
    assert.deepStrictEqual(pick(state, 'status', 'stale', 'hasDocument'), ['invalid', true, true]);
    assert.ok(state.error instanceof JsonSyntaxError);
    assert.deepStrictEqual(pick(state.error, 'code', 'line', 'column', 'expected', 'found'), ['unexpected-end', 1, 6, [',', ']'], null]);
    assert.equal(workspace.output(), before);
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$[0]', '$[1]']);
    workspace.update({ input: '[3]' });
    assert.deepStrictEqual(pick(workspace.getState(), 'status', 'stale', 'error'), ['valid', false, null]);
    assert.equal(outputText(workspace), '[\n  3\n]');
  });

  it('has nothing to show for invalid input without an earlier document', () => {
    const workspace = createWorkspace({ input: '{' });
    assert.deepStrictEqual(pick(workspace.getState(), 'status', 'stale', 'hasDocument'), ['invalid', false, false]);
    assert.equal(workspace.getState().error.code, 'unexpected-end');
    assert.equal(workspace.output(), null);
    assert.deepStrictEqual(workspace.rows(), []);
  });

  it('caches the output until something it depends on changes', () => {
    const workspace = createWorkspace({ input: '{"a": 1}' });
    const first = workspace.output();
    assert.equal(workspace.output(), first);
    workspace.update({ query: '$.a', tab: 'tree', compare: '{}' });
    assert.equal(workspace.output(), first);
    workspace.update({ sortKeys: true });
    assert.notEqual(workspace.output(), first);
  });
});

describe('relaxed mode and repair', () => {
  it('accepts relaxed input and lists the fixes', () => {
    const workspace = createWorkspace({ input: '{a: 1, // c\n}', relaxed: true });
    const state = workspace.getState();
    assert.equal(state.status, 'valid');
    assert.deepStrictEqual(state.repairs.map((repair) => repair.kind), ['unquoted-key', 'trailing-comma', 'comment']);
    assert.equal(outputText(workspace), '{\n  "a": 1\n}');
  });

  it('switches between strict and relaxed parsing of the same input', () => {
    const workspace = createWorkspace({ input: '{a: 1}', relaxed: true });
    workspace.update({ relaxed: false });
    const { status, stale, error } = workspace.getState();
    assert.deepStrictEqual([status, stale], ['invalid', true]);
    assert.deepStrictEqual(pick(error, 'code', 'line', 'column', 'hint'), ['unquoted-key-not-allowed', 1, 2, 'relaxed']);
    workspace.update({ relaxed: true });
    assert.deepStrictEqual(pick(workspace.getState(), 'status', 'stale'), ['valid', false]);
  });

  it('repairs the input in place, then has nothing left to repair', () => {
    const workspace = createWorkspace({ input: '{a: 1, // c\n}', relaxed: true });
    assert.deepStrictEqual(workspace.repair(), { ok: true, count: 3, error: null });
    assert.deepStrictEqual(pick(workspace.getState(), 'input', 'status', 'repairs'), ['{"a": 1\n}', 'valid', []]);
    assert.deepStrictEqual(workspace.repair(), { ok: true, count: 0, error: null });
  });

  it('repairs relaxed input even while strict mode reports it as invalid', () => {
    const workspace = createWorkspace({ input: "{'a': [1,]}" });
    assert.equal(workspace.getState().error.hint, 'relaxed');
    assert.equal(workspace.repair().count, 2);
    assert.deepStrictEqual(pick(workspace.getState(), 'input', 'status', 'relaxed'), ['{"a": [1]}', 'valid', false]);
  });

  it('reports errors that repair cannot fix and leaves the input alone', () => {
    const workspace = createWorkspace({ input: '{a: }' });
    const result = workspace.repair();
    assert.deepStrictEqual([result.ok, result.count], [false, 0]);
    assert.deepStrictEqual(pick(result.error, 'code', 'line', 'column'), ['unexpected-token', 1, 5]);
    assert.equal(workspace.getState().input, '{a: }');
  });
});

describe('tree rows', () => {
  it('opens the first two levels of a loaded document', () => {
    const workspace = createWorkspace();
    workspace.load(NESTED);
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.a.b', '$.d']);
    assert.deepStrictEqual(workspace.rows().map((row) => row.expanded), [true, true, false, false]);
  });

  it('toggles single containers and remembers nested ones', () => {
    const workspace = createWorkspace({ input: NESTED });
    assert.equal(workspace.toggle('$.a.b'), true);
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.a.b', '$.a.b.c', '$.d']);
    assert.equal(workspace.toggle('$.a'), false);
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.d']);
    assert.equal(workspace.toggle('$.a'), true);
    assert.equal(workspace.rows().length, 5);
  });

  it('expands and collapses everything, keeping the top level visible', () => {
    const workspace = createWorkspace({ input: NESTED });
    workspace.expandAll();
    assert.equal(workspace.rows().length, 5);
    workspace.collapseAll();
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.d']);
  });

  it('keeps the expansion while the input is edited, and resets it when a new document is loaded', () => {
    const workspace = createWorkspace({ input: NESTED });
    workspace.expandAll();
    const edited = '{"a": {"b": {"c": 2}}, "d": 3, "e": 4}';
    workspace.update({ input: edited });
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.a.b', '$.a.b.c', '$.d', '$.e']);
    workspace.load(edited);
    assert.deepStrictEqual(rowPaths(workspace), ['$', '$.a', '$.a.b', '$.d', '$.e']);
  });

  it('cycles through the samples', () => {
    const workspace = createWorkspace();
    for (const index of [0, 1, 2, 0]) {
      assert.equal(workspace.loadSample(), index);
      assert.deepStrictEqual(pick(workspace.getState(), 'input', 'status'), [SAMPLES[index], 'valid']);
    }
  });
});

describe('diff and query', () => {
  it('reports why there is no diff', () => {
    assert.deepStrictEqual(createWorkspace({ input: '[1]' }).diff(), { status: 'empty' });
    assert.deepStrictEqual(createWorkspace({ compare: '[1]' }).diff(), { status: 'no-document' });
    const invalid = createWorkspace({ input: '[1]', compare: '[1,' }).diff();
    assert.deepStrictEqual([invalid.status, invalid.error.code, invalid.error.column], ['invalid', 'unexpected-end', 4]);
  });

  it('compares the document with the second document', () => {
    const workspace = createWorkspace({ input: '{"a": 1, "b": 2}', compare: '{"a": 1, "b": 3, "c": 4}' });
    const result = workspace.diff();
    assert.equal(result.status, 'ok');
    assert.deepStrictEqual(result.changes.map((change) => [change.type, change.path]), [['changed', '$.b'], ['added', '$.c']]);
    assert.deepStrictEqual(result.counts, { added: 1, removed: 0, changed: 1 });
    assert.equal(workspace.diff().changes, result.changes);
  });

  it('parses the second document in the same mode as the input', () => {
    const workspace = createWorkspace({ input: '{a: 1}', compare: '{a: 2, // two\n}', relaxed: true });
    assert.deepStrictEqual(workspace.diff().changes.map((change) => change.path), ['$.a']);
    workspace.update({ input: '{"a": 1}', relaxed: false });
    assert.deepStrictEqual(pick(workspace.diff(), 'status'), ['invalid']);
  });

  it('runs the query against the document', () => {
    const workspace = createWorkspace({ input: '{"a": [{"n": 1}, {"n": 2}]}' });
    assert.equal(workspace.queryResult(), null);
    workspace.update({ query: '$..n' });
    const result = workspace.queryResult();
    assert.equal(result.ok, true);
    assert.deepStrictEqual(result.matches.map((match) => [match.path, toValue(match.node)]), [['$.a[0].n', 1], ['$.a[1].n', 2]]);
    workspace.update({ query: '$.missing' });
    assert.deepStrictEqual(workspace.queryResult(), { ok: true, matches: [] });
    workspace.update({ query: '$.' });
    const failed = workspace.queryResult();
    assert.equal(failed.ok, false);
    assert.ok(failed.error instanceof QueryError);
    assert.equal(failed.error.column, 3);
    assert.equal(createWorkspace({ query: '$' }).queryResult(), null);
  });
});

describe('samples and the ?demo state', () => {
  it('ships samples that are strict JSON', () => {
    for (const sample of SAMPLES) {
      const result = tryParse(sample);
      assert.equal(result.ok, true);
      assert.deepStrictEqual(toValue(result.ast), JSON.parse(sample));
    }
    assert.ok(SAMPLES[0].includes('"Merhaba dünya \\ud83d\\udc4b"'));
    assert.equal(JSON.parse(SAMPLES[0]).greeting, `Merhaba dünya ${String.fromCodePoint(0x1f44b)}`);
    assert.ok(JSON.parse(SAMPLES[1]).orders[0].note.includes(String.fromCharCode(0x2014)));
  });

  it('keeps the 20-digit id of the project sample', () => {
    const workspace = createWorkspace({ input: SAMPLES[0] });
    assert.ok(outputText(workspace).includes('"id": 12345678901234567890,'));
    workspace.update({ mode: 'minify' });
    assert.ok(outputText(workspace).includes('"id":12345678901234567890,'));
  });

  it('builds the demo: the project in the tree view next to an input with one missing comma', () => {
    assert.equal(DEMO.broken.length, DEMO.document.length - 1);
    const workspace = createDemoWorkspace();
    const state = workspace.getState();
    assert.deepStrictEqual(pick(state, 'status', 'stale', 'hasDocument', 'tab', 'input'), ['invalid', true, true, 'tree', DEMO.broken]);
    assert.deepStrictEqual(pick(state.error, 'code', 'line', 'column', 'expected', 'found'), ['unexpected-token', 6, 3, [',', '}'], '"private"']);
    assert.equal(state.error.message, `Expected ',' or '}' but found "private" (Line 6, column 3)`);
    assert.equal(workspace.rows().length, 25);
    assert.equal(outputText(workspace), outputText(createWorkspace({ input: DEMO.document })));
    const diff = workspace.diff();
    assert.deepStrictEqual(diff.counts, { added: 3, removed: 1, changed: 2 });
    assert.deepStrictEqual(diff.changes.map((change) => `${change.type} ${change.path}`), [
      'changed $.version',
      'changed $.rating',
      'added $.features[6]',
      'removed $.settings.relaxed',
      'added $.tags[0]',
      'added $.tags[1]',
    ]);
  });
});

/** The listed fields of an object, in order. */
function pick(object, ...keys) {
  return keys.map((key) => object[key]);
}
