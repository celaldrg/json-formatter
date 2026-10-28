import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { format, formatSegments, INDENTS, preview } from '../src/formatter.js';
import { parse } from '../src/parser.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const SAMPLE = '{"a":[1,{"b":null}],"c":"x","d":{},"e":[],"f":[true,false]}';
const EMOJI = String.fromCodePoint(0x1f600);

const ast = (text) => parse(text).ast;

describe('format', () => {
  it('matches JSON.stringify for indent 2, 4, tab and 0', () => {
    const value = JSON.parse(SAMPLE);
    assert.deepStrictEqual(INDENTS, [2, 4, 'tab']);
    assert.equal(format(ast(SAMPLE), { indent: 2 }), JSON.stringify(value, null, 2));
    assert.equal(format(ast(SAMPLE), { indent: 4 }), JSON.stringify(value, null, 4));
    assert.equal(format(ast(SAMPLE), { indent: 'tab' }), JSON.stringify(value, null, '\t'));
    assert.equal(format(ast(SAMPLE), { indent: '\t' }), JSON.stringify(value, null, '\t'));
    assert.equal(format(ast(SAMPLE), { indent: 0 }), JSON.stringify(value));
    assert.equal(format(ast(SAMPLE), { indent: 8 }), JSON.stringify(value, null, 8));
  });

  it('indents with 2 spaces by default', () => {
    assert.equal(format(ast('{"a":[1]}')), '{\n  "a": [\n    1\n  ]\n}');
  });

  it('minifies with indent 0', () => {
    assert.equal(format(ast('{ "a" : [ 1 , 2 ] ,\r\n "b" : { } }'), { indent: 0 }), '{"a":[1,2],"b":{}}');
  });

  it('keeps empty containers on one line', () => {
    assert.equal(format(ast('{"a": [ ], "b": {\n}}')), '{\n  "a": [],\n  "b": {}\n}');
    assert.equal(format(ast(' [ ] ')), '[]');
  });

  it('keeps numbers exactly as written', () => {
    const text = '[1.0, 1e5, -0, 1.50E+2, 0.1000000000000000055511151231257827, 1e400]';
    assert.equal(format(ast(text), { indent: 0 }), text.replaceAll(' ', ''));
  });

  it('keeps 12345678901234567890 with all its digits (pretty, minified and sorted)', () => {
    const text = '{"id": 12345678901234567890, "big": [-98765432109876543210.5e-3]}';
    assert.equal(JSON.stringify(JSON.parse(text)).includes('12345678901234567890'), false);
    assert.equal(format(ast(text)), '{\n  "id": 12345678901234567890,\n  "big": [\n    -98765432109876543210.5e-3\n  ]\n}');
    assert.equal(format(ast(text), { indent: 0 }), '{"id":12345678901234567890,"big":[-98765432109876543210.5e-3]}');
    assert.equal(format(ast(text), { indent: 0, sortKeys: true }), '{"big":[-98765432109876543210.5e-3],"id":12345678901234567890}');
  });

  it('keeps the escapes of strict strings', () => {
    assert.equal(format(ast('["\\u00e9\\n", "é", "\\/"]'), { indent: 0 }), '["\\u00e9\\n","é","\\/"]');
  });

  it('writes relaxed input as strict JSON', () => {
    const relaxed = parse("{name: 'it\\'s \"ok\"', /* note */ 'list': [1, 2,], // end\n}", { relaxed: true }).ast;
    const output = format(relaxed, { indent: 0 });
    assert.equal(output, '{"name":"it\'s \\"ok\\"","list":[1,2]}');
    assert.deepStrictEqual(JSON.parse(output), toValue(relaxed));
  });

  it('rejects unsupported indents', () => {
    for (const indent of [9, -1, 1.5, 'x', '  ', null]) {
      assert.throws(() => format(ast('[]'), { indent }), RangeError, String(indent));
    }
  });
});

describe('sortKeys', () => {
  it('sorts every object recursively, leaves arrays in order and keeps duplicates stable', () => {
    const text = '{"b": 1, "a": {"d": [{"z": 1, "y": 2}, 3], "c": 3}, "a": 0, "B": 2, "": 4}';
    const sorted = format(ast(text), { indent: 0, sortKeys: true });
    assert.equal(sorted, '{"":4,"B":2,"a":{"c":3,"d":[{"y":2,"z":1},3]},"a":0,"b":1}');
    assert.deepStrictEqual(JSON.parse(sorted), JSON.parse(text));
  });

  it('compares names by UTF-16 code units, like Array.prototype.sort', () => {
    const names = ['é', 'z', EMOJI, String.fromCharCode(0xfb00), 'Z', 'a'];
    const text = JSON.stringify(Object.fromEntries(names.map((name, index) => [name, index])));
    const sorted = parse(format(ast(text), { sortKeys: true })).ast.members.map((member) => member.key.value);
    assert.deepStrictEqual(sorted, [...names].sort());
    assert.deepStrictEqual(sorted, ['Z', 'a', 'z', 'é', EMOJI, String.fromCharCode(0xfb00)]);
  });

  it('keeps duplicate names in order in large objects too, so the last one still wins', () => {
    const names = ['b', 'a', 'c', 'a', 'b'];
    const pairs = Array.from({ length: 300 }, (_, index) => [names[index % names.length], index]);
    const text = `{${pairs.map(([name, value]) => `"${name}": ${value}`).join(', ')}}`;
    const sorted = format(ast(text), { sortKeys: true });
    const stable = [...pairs].sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1));
    assert.deepStrictEqual(parse(sorted).ast.members.map((member) => [member.key.value, member.value.value]), stable);
    assert.deepStrictEqual(JSON.parse(sorted), JSON.parse(text));
  });

  it('does not change the input order without the option', () => {
    assert.equal(format(ast('{"b": 1, "a": 2}'), { indent: 0 }), '{"b":1,"a":2}');
  });
});

describe('formatSegments', () => {
  it('labels every piece of the output for highlighting', () => {
    const segments = formatSegments(ast('{"a": [1, "x", true, null]}'), { indent: 0 });
    assert.deepStrictEqual(segments, [
      { kind: 'punctuation', text: '{' },
      { kind: 'key', text: '"a"' },
      { kind: 'punctuation', text: ':' },
      { kind: 'punctuation', text: '[' },
      { kind: 'number', text: '1' },
      { kind: 'punctuation', text: ',' },
      { kind: 'string', text: '"x"' },
      { kind: 'punctuation', text: ',' },
      { kind: 'boolean', text: 'true' },
      { kind: 'punctuation', text: ',' },
      { kind: 'null', text: 'null' },
      { kind: 'punctuation', text: ']' },
      { kind: 'punctuation', text: '}' },
    ]);
  });

  it('joins to exactly the formatted text', () => {
    for (const options of [{}, { indent: 4, sortKeys: true }, { indent: 'tab' }, { indent: 0 }]) {
      const text = segmentsText(formatSegments(ast(SAMPLE), options));
      assert.equal(text, format(ast(SAMPLE), options));
    }
    const pretty = formatSegments(ast('{"a": 1}'));
    assert.deepStrictEqual(pretty.filter((segment) => segment.kind === 'whitespace').map((segment) => segment.text), ['\n  ', ' ', '\n']);
  });
});

describe('preview', () => {
  it('shows short values as minified JSON', () => {
    assert.equal(preview(ast('{ "a" : [1, 2] }')), '{"a":[1,2]}');
    assert.equal(preview(ast('"text"')), '"text"');
  });

  it('cuts long values with an ellipsis at the requested length', () => {
    const long = preview(ast(`[${'1,'.repeat(100)}1]`), 20);
    assert.equal(long, `[${'1,'.repeat(9)}…`);
    assert.equal(long.length, 20);
    assert.equal(preview(ast(`"${'x'.repeat(100)}"`)).length, 60);
  });

  it('never splits a surrogate pair', () => {
    const text = `"${EMOJI.repeat(30)}"`;
    assert.equal(preview(ast(text), 10), `"${EMOJI.repeat(4)}…`);
    assert.equal(preview(ast(text), 9), `"${EMOJI.repeat(3)}…`);
  });
});

function segmentsText(segments) {
  return segments.map((segment) => segment.text).join('');
}
