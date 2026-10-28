import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { JsonSyntaxError } from '../src/errors.js';
import { MAX_DEPTH, parse, tryParse } from '../src/parser.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const EMOJI = String.fromCodePoint(0x1f600);

/** [name, JSON text]: each one must parse to exactly what JSON.parse returns. */
const VALID = [
  ['zero', '0'],
  ['negative zero', '-0'],
  ['integer', '42'],
  ['negative integer', '-17'],
  ['fraction', '3.14159'],
  ['negative fraction', '-0.5'],
  ['fraction with trailing zeros', '1.500'],
  ['exponent', '1e10'],
  ['capital exponent', '2E3'],
  ['exponent with a plus sign', '6.02e+23'],
  ['exponent with a minus sign', '1.5E-7'],
  ['zero with an exponent', '0e0'],
  ['exponent that overflows to Infinity', '1e400'],
  ['exponent that underflows to zero', '-1e-400'],
  ['integer beyond the safe range', '12345678901234567890'],
  ['true', 'true'],
  ['false', 'false'],
  ['null', 'null'],
  ['empty string', '""'],
  ['plain string', '"hello, world"'],
  ['every short escape', '"\\" \\\\ \\/ \\b \\f \\n \\r \\t"'],
  ['unicode escape', '"caf\\u00e9"'],
  ['unicode escapes in upper and mixed case', '"\\u00C9\\u00dF\\uAbCd"'],
  ['escaped surrogate pair', '"\\ud83d\\ude00"'],
  ['literal astral character', `"${EMOJI}"`],
  ['lone high surrogate escape', '"\\ud800"'],
  ['lone low surrogate escape', '"x\\udc00"'],
  ['surrogate escapes in reverse order', '"\\udc00\\ud800"'],
  ['escaped NUL, unit separator and DEL', '"\\u0000\\u001f\\u007f"'],
  ['Turkish letters', '"Ğğ İı Şş Çç Öö Üü"'],
  ['raw line and paragraph separators', `"${String.fromCharCode(0x2028, 0x2029)}"`],
  ['raw DEL character', `"${String.fromCharCode(0x7f)}"`],
  ['unescaped slash', '"a/b"'],
  ['escaped quotes in a key', '{"say \\"hi\\"": 1}'],
  ['empty array', '[]'],
  ['empty object', '{}'],
  ['whitespace inside empty containers', '[ \t\n\r ]'],
  ['nested empty containers', '[[], {}, [[]], {"a": {}}]'],
  ['mixed array', '[1, "two", true, false, null, {"x": [3]}]'],
  ['whitespace around the document', ' \t\r\n {"a" : 1 } \n\t '],
  ['CRLF line breaks', '{\r\n  "a": [\r\n    1,\r\n    2\r\n  ]\r\n}\r\n'],
  ['lone CR line breaks', '[1,\r2,\r3]'],
  ['empty key', '{"": 0}'],
  ['duplicate keys: the last one wins', '{"a": 1, "b": 2, "a": 3}'],
  ['__proto__ key', '{"__proto__": {"polluted": true}}'],
  ['keys named like Object.prototype members', '{"constructor": 1, "toString": 2, "hasOwnProperty": 3}'],
  ['keys with spaces and symbols', '{"first name": 1, "a.b": 2, "[0]": 3, "$": 4}'],
  ['astral key and value', `{"${EMOJI}": "${EMOJI}"}`],
  [`${MAX_DEPTH} nested arrays`, '['.repeat(MAX_DEPTH) + ']'.repeat(MAX_DEPTH)],
  [`${MAX_DEPTH} nested objects`, '{"a":'.repeat(MAX_DEPTH - 1) + '{}' + '}'.repeat(MAX_DEPTH - 1)],
  [`${MAX_DEPTH} levels of mixed nesting`, '[{"a":'.repeat(MAX_DEPTH / 2) + 'null' + '}]'.repeat(MAX_DEPTH / 2)],
  ['long string', `"${'x'.repeat(100_000)}"`],
  ['object with 1000 members', `{${Array.from({ length: 1000 }, (_, index) => `"k${index}": ${index}`).join(', ')}}`],
];

describe('valid documents', () => {
  it(`has at least 40 cases (${VALID.length})`, () => {
    assert.ok(VALID.length >= 40);
  });

  for (const [name, text] of VALID) {
    it(name, () => {
      const expected = JSON.parse(text);
      const strict = parse(text);
      assert.deepStrictEqual(toValue(strict.ast), expected);
      assert.deepStrictEqual(strict.repairs, []);
      const relaxed = parse(text, { relaxed: true });
      assert.deepStrictEqual(toValue(relaxed.ast), expected);
      assert.deepStrictEqual(relaxed.repairs, []);
    });
  }
});

describe('AST nodes', () => {
  const where = ({ type, start, end, line, column }) => ({ type, start, end, line, column });

  it('record the offsets, line and column of every node', () => {
    const text = '{\n  "a": [1, true],\n  "b": null\n}';
    const { ast } = parse(text);
    const [a, b] = ast.members;
    assert.deepStrictEqual(where(ast), { type: 'object', start: 0, end: 33, line: 1, column: 1 });
    assert.deepStrictEqual(where(a.key), { type: 'string', start: 4, end: 7, line: 2, column: 3 });
    assert.deepStrictEqual(where(a.value), { type: 'array', start: 9, end: 18, line: 2, column: 8 });
    assert.deepStrictEqual(where(a.value.items[0]), { type: 'number', start: 10, end: 11, line: 2, column: 9 });
    assert.deepStrictEqual(where(a.value.items[1]), { type: 'boolean', start: 13, end: 17, line: 2, column: 12 });
    assert.deepStrictEqual(where(b.key), { type: 'string', start: 22, end: 25, line: 3, column: 3 });
    assert.deepStrictEqual(where(b.value), { type: 'null', start: 27, end: 31, line: 3, column: 8 });
    assert.deepStrictEqual([a.start, a.end, b.start, b.end], [4, 18, 22, 31]);
  });

  it('count columns in UTF-16 code units and lines after \\r\\n, \\n and \\r', () => {
    const { items } = parse(`["${EMOJI}", 5,\r\n 1,\n  2,\r   3]`).ast;
    assert.deepStrictEqual(
      items.map((node) => [node.line, node.column]),
      [[1, 2], [1, 8], [2, 2], [3, 3], [4, 4]],
    );
  });

  it('keep the source text of strings and numbers next to their values', () => {
    const [string, number, big] = parse('["\\u0041\\n", 1.50, 12345678901234567890]').ast.items;
    assert.equal(string.value, 'A\n');
    assert.equal(string.raw, '"\\u0041\\n"');
    assert.equal(string.relaxed, false);
    assert.equal(number.value, 1.5);
    assert.equal(number.raw, '1.50');
    assert.equal(big.raw, '12345678901234567890');
    assert.equal(big.value, 12345678901234567000);
  });

  it('keep duplicate members in source order', () => {
    const { ast } = parse('{"a": 1, "a": 2}');
    assert.deepStrictEqual(ast.members.map((member) => [member.key.value, member.value.value]), [['a', 1], ['a', 2]]);
  });
});

describe('tryParse', () => {
  it('returns the AST or the error instead of throwing', () => {
    const good = tryParse('[1]');
    assert.equal(good.ok, true);
    assert.deepStrictEqual(toValue(good.ast), [1]);
    const bad = tryParse('[1');
    assert.equal(bad.ok, false);
    assert.ok(bad.error instanceof JsonSyntaxError);
  });

  it('rejects input that is not a string', () => {
    assert.throws(() => parse(42), TypeError);
    assert.throws(() => tryParse(null), TypeError);
  });
});
