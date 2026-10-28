import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { countChanges, diff } from '../src/diff.js';
import { parse } from '../src/parser.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.

/** The changes between two JSON texts as [type, path, before value, after value]. */
function changes(left, right) {
  return diff(parse(left).ast, parse(right).ast).map((change) => [
    change.type,
    change.path,
    change.before === null ? undefined : toValue(change.before),
    change.after === null ? undefined : toValue(change.after),
  ]);
}

describe('diff', () => {
  it('lists added, removed and changed paths in document order', () => {
    const left = '{"name": "a", "tags": ["x", "y"], "meta": {"v": 1, "old": true}}';
    const right = '{"name": "b", "tags": ["x"], "meta": {"v": 1, "new": null}, "extra": 0}';
    assert.deepStrictEqual(changes(left, right), [
      ['changed', '$.name', 'a', 'b'],
      ['removed', '$.tags[1]', 'y', undefined],
      ['removed', '$.meta.old', true, undefined],
      ['added', '$.meta.new', undefined, null],
      ['added', '$.extra', undefined, 0],
    ]);
  });

  it('finds no changes between equal documents, whatever their key order or layout', () => {
    assert.deepStrictEqual(changes('{"a": 1, "b": [1, {"c": null}]}', '{ "b" : [ 1, { "c": null } ],\n "a": 1 }'), []);
    assert.deepStrictEqual(changes('"\\u00e9"', '"é"'), []);
  });

  it('compares numbers by their exact value, not by their spelling or by a rounded double', () => {
    assert.deepStrictEqual(changes('[1, 1.0, 1e2, 0.5, -0]', '[1.00, 1, 100, 5E-1, 0]'), []);
    assert.deepStrictEqual(changes('[12345678901234567890]', '[12345678901234567891]'), [
      ['changed', '$[0]', 12345678901234567000, 12345678901234567000],
    ]);
    const [change] = diff(parse('[12345678901234567890]').ast, parse('[12345678901234567891]').ast);
    assert.deepStrictEqual([change.before.raw, change.after.raw], ['12345678901234567890', '12345678901234567891']);
  });

  it('reports a change of type once, without looking inside', () => {
    assert.deepStrictEqual(changes('{"a": [1]}', '{"a": {"0": 1}}'), [['changed', '$.a', [1], { 0: 1 }]]);
    assert.deepStrictEqual(changes('1', '"1"'), [['changed', '$', 1, '1']]);
    assert.deepStrictEqual(changes('null', 'false'), [['changed', '$', null, false]]);
  });

  it('compares arrays index by index', () => {
    assert.deepStrictEqual(changes('[1]', '[1, 2, 3]'), [
      ['added', '$[1]', undefined, 2],
      ['added', '$[2]', undefined, 3],
    ]);
    assert.deepStrictEqual(changes('[1, 2, 3]', '[2, 3]'), [
      ['changed', '$[0]', 1, 2],
      ['changed', '$[1]', 2, 3],
      ['removed', '$[2]', 3, undefined],
    ]);
  });

  it('quotes paths that are not plain names', () => {
    assert.deepStrictEqual(changes('{"first name": 1, "": 2}', '{"first name": 3, "": 4}'), [
      ['changed', '$["first name"]', 1, 3],
      ['changed', '$[""]', 2, 4],
    ]);
  });

  it('lets the last duplicate key win, as JSON.parse does', () => {
    assert.deepStrictEqual(changes('{"a": 1, "a": 2}', '{"a": 2}'), []);
    assert.deepStrictEqual(changes('{"a": 2}', '{"a": 2, "a": 3}'), [['changed', '$.a', 2, 3]]);
  });

  it('keeps the source nodes, so the UI can point at both sides', () => {
    const [change] = diff(parse('{\n  "a": 1\n}').ast, parse('{"a": 2}').ast);
    assert.deepStrictEqual([change.before.line, change.before.column, change.after.line, change.after.column], [2, 8, 1, 7]);
  });

  it('handles the deepest documents', () => {
    const nested = (value) => '['.repeat(1000) + value + ']'.repeat(1000);
    assert.deepStrictEqual(changes(nested(1), nested(2)), [['changed', `$${'[0]'.repeat(1000)}`, 1, 2]]);
  });
});

describe('countChanges', () => {
  it('counts each kind of change', () => {
    const list = diff(parse('{"a": 1, "b": 2, "c": [1]}').ast, parse('{"a": 2, "c": [1, 2, 3], "d": 4}').ast);
    assert.deepStrictEqual(countChanges(list), { added: 3, removed: 1, changed: 1 });
    assert.deepStrictEqual(countChanges([]), { added: 0, removed: 0, changed: 0 });
  });
});
