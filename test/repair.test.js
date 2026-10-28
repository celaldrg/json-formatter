import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { JsonSyntaxError } from '../src/errors.js';
import { parse } from '../src/parser.js';
import { repair } from '../src/repair.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.

describe('relaxed parsing', () => {
  it('accepts comments, trailing commas, single quotes and unquoted keys and lists each one', () => {
    const { ast, repairs } = parse("{a: 'x', /* c */ \"b\": [1,],}", { relaxed: true });
    assert.deepStrictEqual(toValue(ast), { a: 'x', b: [1] });
    assert.deepStrictEqual(repairs, [
      { kind: 'unquoted-key', start: 1, end: 2, line: 1, column: 2, text: '"a"' },
      { kind: 'single-quote', start: 4, end: 7, line: 1, column: 5, text: '"x"' },
      { kind: 'comment', start: 9, end: 16, line: 1, column: 10, text: '' },
      { kind: 'trailing-comma', start: 24, end: 25, line: 1, column: 25, text: '' },
      { kind: 'trailing-comma', start: 26, end: 27, line: 1, column: 27, text: '' },
    ]);
  });

  it('marks relaxed strings so the formatter re-quotes them', () => {
    const { ast } = parse("{key: 'v', \"k\": \"v\"}", { relaxed: true });
    const [unquoted, quoted] = ast.members;
    assert.deepStrictEqual([unquoted.key.relaxed, unquoted.value.relaxed], [true, true]);
    assert.deepStrictEqual([quoted.key.relaxed, quoted.value.relaxed], [false, false]);
  });

  it('accepts Unicode names, $ and _ as unquoted keys, and literal words as names', () => {
    const { ast } = parse('{şehir: 1, $ref: 2, _id: 3, café: 4, null: 5, true: 6}', { relaxed: true });
    assert.deepStrictEqual(Object.keys(toValue(ast)), ['şehir', '$ref', '_id', 'café', 'null', 'true']);
  });

  it('decodes escapes in single-quoted strings, including \\\'', () => {
    const { ast } = parse("['it\\'s', 'say \"hi\"', '\\u00e9\\t']", { relaxed: true });
    assert.deepStrictEqual(toValue(ast), ["it's", 'say "hi"', 'é\t']);
  });

  it('still rejects \\\' inside double-quoted strings', () => {
    assert.throws(() => parse('["it\\\'s"]', { relaxed: true }), { code: 'invalid-escape', column: 5 });
  });
});

describe('repair', () => {
  it('rewrites all four relaxed constructs with minimal edits', () => {
    const input = [
      '{',
      '  // leading comment',
      "  name: 'demo', /* inline */ \"list\": [1, 2, 3,],",
      "  'it\\'s': \"ok\", // trailing",
      '}',
      '',
    ].join('\n');
    const result = repair(input);
    assert.equal(result.ok, true);
    assert.equal(result.text, '{\n  "name": "demo", "list": [1, 2, 3],\n  "it\'s": "ok"\n}\n');
    assert.deepStrictEqual(result.repairs.map((item) => item.kind), [
      'comment', 'unquoted-key', 'single-quote', 'comment', 'trailing-comma', 'single-quote', 'trailing-comma', 'comment',
    ]);
    assert.deepStrictEqual(toValue(parse(result.text).ast), { name: 'demo', list: [1, 2, 3], "it's": 'ok' });
  });

  it('returns strict JSON unchanged', () => {
    const text = '{"a": [1, 2], "b": "\\u00e9"}';
    assert.deepStrictEqual(repair(text), { ok: true, text, repairs: [] });
  });

  it('keeps the layout, escapes and number spelling of everything else', () => {
    const result = repair("[\n  1.50E+2,\n  '\\u00e9',\n  \"\\u00e9\",\n]");
    assert.equal(result.text, '[\n  1.50E+2,\n  "é",\n  "\\u00e9"\n]');
  });

  it('removes comment-only lines together with their line break, CRLF included', () => {
    assert.equal(repair('{\r\n  // c\r\n  "a": 1\r\n}').text, '{\r\n  "a": 1\r\n}');
    assert.equal(repair('{\n  /* multi\n     line */\n  "a": 1\n}').text, '{\n  "a": 1\n}');
    assert.equal(repair('// header\n1').text, '1');
    assert.equal(repair('[1]\n// footer').text, '[1]');
    assert.equal(repair('[1]\r\n// footer\r\n').text, '[1]\r\n');
    assert.equal(repair('[1]\r\n// footer').text, '[1]');
    assert.equal(repair('[1]\r// footer').text, '[1]');
  });

  it('removes trailing and inline comments with the blanks around them', () => {
    assert.equal(repair('[1, // one\n 2]').text, '[1,\n 2]');
    assert.equal(repair('[1, /* a */ /* b */ 2]').text, '[1, 2]');
    assert.equal(repair('[1/* tight */,2]').text, '[1,2]');
    assert.equal(repair('1 // end').text, '1');
  });

  it('removes comments that only whitespace separates as one block', () => {
    assert.equal(repair('1 /* a */ /* b */').text, '1');
    assert.equal(repair('{"a": 1 /* x */ // y\n}').text, '{"a": 1\n}');
    assert.equal(repair('[1]\n// a\n// b').text, '[1]');
    assert.equal(repair('[1]\r\n/* a */\r\n// b\r\n').text, '[1]\r\n');
    assert.equal(repair('{\n  "a": 1, // one\n  // two\n  "b": 2\n}').text, '{\n  "a": 1,\n  "b": 2\n}');
    assert.equal(repair('{\n  // a\n\n  // b\n  "x": 1\n}').text, '{\n  "x": 1\n}');
  });

  it('keeps blank lines that are not inside a comment block', () => {
    assert.equal(repair('{\n  "a": 1,\n\n  // section\n  "b": 2\n}').text, '{\n  "a": 1,\n\n  "b": 2\n}');
  });

  it('quotes unquoted keys and re-quotes single-quoted strings with JSON escapes', () => {
    assert.equal(repair('{$ref: 1, şehir: 2}').text, '{"$ref": 1, "şehir": 2}');
    assert.equal(repair("['say \"hi\"', 'tab\\there']").text, '["say \\"hi\\"", "tab\\there"]');
  });

  it('removes trailing commas in arrays and objects, even before a comment', () => {
    assert.equal(repair('{"a": [1,], "b": {"c": 2,},}').text, '{"a": [1], "b": {"c": 2}}');
    assert.equal(repair('[1, /* last */ ]').text, '[1 ]');
  });

  it('reports what relaxed mode cannot fix', () => {
    const result = repair('{a: }');
    assert.equal(result.ok, false);
    assert.ok(result.error instanceof JsonSyntaxError);
    assert.deepStrictEqual([result.error.code, result.error.line, result.error.column], ['unexpected-token', 1, 5]);
  });
});
