import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, tryParse } from '../src/parser.js';
import { query } from '../src/query.js';
import { DEMO } from '../src/samples.js';
import { createWorkspace } from '../src/workspace.js';
import {
  clampSplit,
  countLines,
  downloadName,
  errorRange,
  formatBytes,
  matchRows,
  normalizeNewlines,
  parseSplit,
  pickLanguage,
  PREFERENCE_KEYS,
  readPreferences,
  SPLIT,
  utf8Length,
  visibleRange,
} from '../src/view-utils.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.

/** The error of a document that does not parse. */
function errorOf(text, relaxed = false) {
  const result = tryParse(text, { relaxed });
  assert.equal(result.ok, false, text);
  return result.error;
}

/** The text an error marker covers. */
function marked(text, relaxed = false) {
  const range = errorRange(text, errorOf(text, relaxed), relaxed);
  return text.slice(range.start, range.end);
}

describe('countLines', () => {
  it('counts \\n, \\r\\n and lone \\r as line breaks', () => {
    const cases = [['', 1], ['a', 1], ['a\nb', 2], ['a\r\nb', 2], ['a\rb', 2], ['\n\n', 3], ['a\r\n\r\nb', 3], ['\r\r\n', 3]];
    for (const [text, lines] of cases) assert.equal(countLines(text), lines, JSON.stringify(text));
  });

  it('agrees with the line numbers of the parser', () => {
    const text = '[\n1,\r\n2,\r3\n]';
    const { ast } = parse(text);
    assert.deepStrictEqual(ast.items.map((item) => item.line), [2, 3, 4]);
    assert.equal(countLines(text), 5);
  });
});

describe('utf8Length', () => {
  it('matches TextEncoder, lone surrogates included', () => {
    const samples = ['', 'json', 'ü', 'Merhaba dünya', '€ 5', String.fromCodePoint(0x1f44b), '\ud800', '\udc00x', 'a\ud83dz', `${'İ'.repeat(3)}\u0000\u007f\u0080߿ࠀ￿`];
    const encoder = new TextEncoder();
    for (const text of samples) assert.equal(utf8Length(text), encoder.encode(text).length, JSON.stringify(text));
  });
});

describe('formatBytes', () => {
  it('uses B below 1000 bytes and one decimal above', () => {
    assert.equal(formatBytes(0, 'en'), '0 B');
    assert.equal(formatBytes(999, 'en'), '999 B');
    assert.equal(formatBytes(1000, 'en'), '1 KB');
    assert.equal(formatBytes(1536, 'en'), '1.5 KB');
    assert.equal(formatBytes(1023 * 1024, 'en'), '1 MB');
    assert.equal(formatBytes(5 * 1024 * 1024, 'en'), '5 MB');
    assert.equal(formatBytes(3 * 1024 ** 4, 'en'), '3072 GB');
  });

  it('writes the decimal separator of the language', () => {
    assert.equal(formatBytes(1536, 'tr'), '1,5 KB');
    assert.equal(formatBytes(2.25 * 1024 * 1024, 'tr'), '2,3 MB');
  });
});

describe('visibleRange', () => {
  it('returns the items in view plus the overscan, within the list', () => {
    assert.deepStrictEqual(visibleRange({ offset: 0, viewport: 100, itemSize: 20, count: 50 }), { first: 0, last: 5 });
    assert.deepStrictEqual(visibleRange({ offset: 30, viewport: 100, itemSize: 20, count: 50 }), { first: 1, last: 7 });
    assert.deepStrictEqual(visibleRange({ offset: 200, viewport: 100, itemSize: 20, count: 50, overscan: 3 }), { first: 7, last: 18 });
    assert.deepStrictEqual(visibleRange({ offset: 950, viewport: 100, itemSize: 20, count: 50, overscan: 3 }), { first: 44, last: 50 });
  });

  it('copes with padding above the first item, empty lists and unmeasured items', () => {
    assert.deepStrictEqual(visibleRange({ offset: -12, viewport: 40, itemSize: 20, count: 10 }), { first: 0, last: 2 });
    assert.deepStrictEqual(visibleRange({ offset: 0, viewport: 100, itemSize: 20, count: 0 }), { first: 0, last: 0 });
    assert.deepStrictEqual(visibleRange({ offset: 0, viewport: 100, itemSize: 0, count: 9 }), { first: 0, last: 0 });
    assert.deepStrictEqual(visibleRange({ offset: 0, viewport: 100, itemSize: Number.NaN, count: 9 }), { first: 0, last: 0 });
    assert.deepStrictEqual(visibleRange({ offset: 5000, viewport: 100, itemSize: 20, count: 9 }), { first: 9, last: 9 });
  });
});

describe('normalizeNewlines', () => {
  it('turns every line break into \\n, so positions match the textarea', () => {
    assert.equal(normalizeNewlines('a\r\nb\rc\nd\r\n\r\n'), 'a\nb\nc\nd\n\n');
    const text = '{\r\n  "a": 1\r\n  "b": 2\r\n}';
    const before = errorOf(text);
    const after = errorOf(normalizeNewlines(text));
    assert.deepStrictEqual([after.line, after.column], [before.line, before.column]);
  });
});

describe('downloadName', () => {
  it('derives the name from the opened file and the output mode', () => {
    assert.equal(downloadName('data.json', 'pretty'), 'data.formatted.json');
    assert.equal(downloadName('data.json', 'minify'), 'data.min.json');
    assert.equal(downloadName('archive.tar.json', 'pretty'), 'archive.tar.formatted.json');
    assert.equal(downloadName('README', 'minify'), 'README.min.json');
  });

  it('falls back to "document"', () => {
    assert.equal(downloadName(null, 'pretty'), 'document.formatted.json');
    assert.equal(downloadName('.json', 'minify'), 'document.min.json');
    assert.equal(downloadName('  ', 'pretty'), 'document.formatted.json');
  });
});

describe('errorRange', () => {
  it('covers the unexpected token of the ?demo input on line 6', () => {
    const error = errorOf(DEMO.broken);
    const range = errorRange(DEMO.broken, error, false);
    assert.equal(range.line, 6);
    assert.equal(DEMO.broken.slice(range.lineStart, range.lineEnd), '  "private": false,');
    assert.equal(DEMO.broken.slice(range.start, range.end), '"private"');
    assert.equal(range.start - range.lineStart, error.column - 1);
  });

  it('covers whole tokens for token errors', () => {
    assert.equal(marked('[1,]'), ',');
    assert.equal(marked('{abc: 1}'), 'abc');
    assert.equal(marked('// note\n1'), '//');
    assert.equal(marked('{\n  "a" 1}'), '1');
    assert.equal(marked('[1 true]'), 'true');
    assert.equal(marked('['.repeat(1001)), '[');
    assert.equal(marked(`[${String.fromCodePoint(0x1f600)}]`), String.fromCodePoint(0x1f600));
  });

  it('covers a single character for errors inside a token', () => {
    assert.equal(marked('"a\\qb"'), '\\');
    assert.equal(marked('[01]'), '1');
    assert.equal(marked('"\\u12G4"'), 'G');
    assert.equal(marked('1 /* never closed', true), '/');
  });

  it('is empty at a line break or the end of the input', () => {
    for (const text of ['[1, 2', '"abc\n"', '{"a":\n']) {
      const error = errorOf(text);
      const range = errorRange(text, error, false);
      assert.equal(range.start, range.end, JSON.stringify(text));
      assert.equal(range.start, error.offset);
      assert.equal(range.lineEnd, range.start);
    }
  });

  it('stops at the end of the line', () => {
    const text = '{"a": 1 /* long\ncomment */}';
    const range = errorRange(text, errorOf(text), false);
    assert.equal(text.slice(range.start, range.end), '/*');
    assert.ok(range.end <= range.lineEnd);
  });
});

describe('matchRows', () => {
  it('turns query matches into flat rows with types, counts, previews and the lossy flag', () => {
    const { ast } = parse('{"a": [1, {"b": null}], "big": 12345678901234567890, "s": "x"}');
    const rows = matchRows(query(ast, '$.*'));
    const summary = rows.map(({ node, expanded }) => [node.path, node.key, node.type, node.depth, node.count, node.preview, node.lossy, expanded]);
    assert.deepStrictEqual(summary, [
      ['$.a', '$.a', 'array', 0, 2, '', false, false],
      ['$.big', '$.big', 'number', 0, 0, '12345678901234567890', true, false],
      ['$.s', '$.s', 'string', 0, 0, '"x"', false, false],
    ]);
    assert.deepStrictEqual(matchRows(query(ast, '$.a[1]')).map((row) => [row.node.type, row.node.count]), [['object', 1]]);
    assert.deepStrictEqual(matchRows([]), []);
  });
});

describe('preferences', () => {
  const reader = (record) => (key) => (Object.hasOwn(record, key) ? record[key] : null);

  it('reads what the app stores', () => {
    assert.deepStrictEqual(readPreferences(reader({ indent: '4', sortKeys: 'true', relaxed: 'false', mode: 'minify' })), {
      indent: 4,
      mode: 'minify',
      sortKeys: true,
      relaxed: false,
    });
    assert.deepStrictEqual(readPreferences(reader({ indent: 'tab' })), { indent: 'tab' });
    assert.deepStrictEqual(readPreferences(reader({})), {});
  });

  it('leaves damaged values to the workspace, which keeps its defaults', () => {
    const preferences = readPreferences(reader({ indent: 'wide', sortKeys: 'yes', relaxed: '1', mode: 'tiny' }));
    assert.deepStrictEqual(Object.keys(preferences).sort(), ['indent', 'mode']);
    const state = createWorkspace(preferences).getState();
    assert.deepStrictEqual([state.indent, state.mode, state.sortKeys, state.relaxed], [2, 'pretty', false, false]);
  });

  it('round-trips the settings the app saves', () => {
    const workspace = createWorkspace({ indent: 'tab', sortKeys: true, relaxed: true, mode: 'minify' });
    const state = workspace.getState();
    const stored = Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, String(state[key])]));
    const restored = createWorkspace(readPreferences(reader(stored))).getState();
    for (const key of PREFERENCE_KEYS) assert.equal(restored[key], state[key], key);
  });

  it('picks a supported language', () => {
    assert.deepStrictEqual(['tr', 'en', null, 'de', '__proto__'].map(pickLanguage), ['tr', 'en', 'en', 'en', 'en']);
  });

  it('keeps the split ratio within range', () => {
    assert.equal(clampSplit(0.1), SPLIT.min);
    assert.equal(clampSplit(0.9), SPLIT.max);
    assert.equal(clampSplit(0.5), 0.5);
    assert.deepStrictEqual(['0.6', '0.01', '2', 'x', '', null].map(parseSplit), [0.6, SPLIT.min, SPLIT.max, SPLIT.initial, SPLIT.initial, SPLIT.initial]);
  });
});
