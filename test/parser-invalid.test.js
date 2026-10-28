import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JsonSyntaxError } from '../src/errors.js';
import { MAX_DEPTH, parse } from '../src/parser.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const EMOJI = String.fromCodePoint(0x1f600);

/**
 * Each case gives the input and the exact error: lines and columns are 1-based and columns count
 * UTF-16 code units. `expected`, `found` (null = end of input) and `limit` are checked when given;
 * `hint` is always checked (null unless given).
 */
const INVALID = [
  { name: 'empty input', text: '', code: 'unexpected-end', line: 1, column: 1, expected: ['value'], found: null },
  { name: 'only whitespace', text: '  \n  ', code: 'unexpected-end', line: 2, column: 3, expected: ['value'] },
  { name: 'missing comma between items', text: '[1 2]', code: 'unexpected-token', line: 1, column: 4, expected: [',', ']'], found: '2' },
  {
    name: 'missing comma between members on separate lines',
    text: '{\n  "a": 1\n  "b": 2\n}',
    code: 'unexpected-token', line: 3, column: 3, expected: [',', '}'], found: '"b"',
  },
  { name: 'missing colon', text: '{"a" 1}', code: 'unexpected-token', line: 1, column: 6, expected: [':'], found: '1' },
  { name: 'missing value after a colon', text: '{"a": }', code: 'unexpected-token', line: 1, column: 7, expected: ['value'], found: '}' },
  { name: 'comma before the first item', text: '[,1]', code: 'unexpected-token', line: 1, column: 2, expected: ['value', ']'], found: ',' },
  {
    name: 'trailing comma in an array',
    text: '[1, 2,]',
    code: 'trailing-comma-not-allowed', line: 1, column: 6, expected: ['value'], found: ']', hint: 'relaxed',
  },
  {
    name: 'trailing comma in an object',
    text: '{"a": 1,\n}',
    code: 'trailing-comma-not-allowed', line: 1, column: 8, expected: ['string'], found: '}', hint: 'relaxed',
  },
  { name: 'unclosed array', text: '[1, 2', code: 'unexpected-end', line: 1, column: 6, expected: [',', ']'], found: null },
  { name: 'unclosed object', text: '{"a": 1', code: 'unexpected-end', line: 1, column: 8, expected: [',', '}'] },
  { name: 'mismatched closing bracket', text: '[1}', code: 'unexpected-token', line: 1, column: 3, expected: [',', ']'], found: '}' },
  { name: 'extra closing bracket', text: '[1]]', code: 'unexpected-token', line: 1, column: 4, expected: ['eof'], found: ']' },
  { name: 'two top-level values', text: '{} []', code: 'unexpected-token', line: 1, column: 4, expected: ['eof'], found: '[' },
  { name: 'string not closed before the end', text: '["abc', code: 'unterminated-string', line: 1, column: 6, expected: ['"'] },
  { name: 'string broken by a line break', text: '{"a": "line\nnext"}', code: 'unterminated-string', line: 1, column: 12, expected: ['"'] },
  { name: 'raw tab inside a string', text: '"a\tb"', code: 'control-character', line: 1, column: 3, found: 'U+0009' },
  { name: 'invalid escape', text: '["a\\qb"]', code: 'invalid-escape', line: 1, column: 4, found: '\\q' },
  {
    name: 'non-hex digit in a unicode escape',
    text: '["\\u12G4"]',
    code: 'invalid-unicode-escape', line: 1, column: 7, expected: ['hex'], found: 'G',
  },
  {
    name: 'unicode escape cut short by the end of input',
    text: '"\\u12',
    code: 'invalid-unicode-escape', line: 1, column: 6, expected: ['hex'], found: null,
  },
  { name: 'leading zero', text: '[01]', code: 'leading-zero', line: 1, column: 3, found: '1' },
  { name: 'fraction without digits', text: '[1.]', code: 'invalid-number', line: 1, column: 4, expected: ['digit'], found: ']' },
  { name: 'exponent without digits', text: '1e+', code: 'invalid-number', line: 1, column: 4, expected: ['digit'], found: null },
  { name: 'lone minus sign', text: '-', code: 'invalid-number', line: 1, column: 2, expected: ['digit'], found: null },
  { name: 'plus sign', text: '+1', code: 'unexpected-token', line: 1, column: 1, expected: ['value'], found: '+' },
  { name: 'misspelled literal', text: '[tru]', code: 'unexpected-token', line: 1, column: 2, expected: ['value', ']'], found: 'tru' },
  { name: 'capitalised literal', text: 'True', code: 'unexpected-token', line: 1, column: 1, expected: ['value'], found: 'True' },
  { name: 'NaN', text: '[1, NaN]', code: 'unexpected-token', line: 1, column: 5, expected: ['value'], found: 'NaN' },
  { name: 'letters after a number', text: '[1a]', code: 'unexpected-token', line: 1, column: 3, expected: [',', ']'], found: 'a' },
  { name: 'unexpected character', text: '[1, @]', code: 'unexpected-token', line: 1, column: 5, expected: ['value'], found: '@' },
  {
    name: 'no-break space pasted from a web page',
    text: `{"a":${String.fromCharCode(0xa0)}1}`,
    code: 'unexpected-token', line: 1, column: 6, expected: ['value'], found: 'U+00A0',
  },
  {
    name: 'byte order mark before the document',
    text: `${String.fromCharCode(0xfeff)}{}`,
    code: 'unexpected-token', line: 1, column: 1, expected: ['value'], found: 'U+FEFF',
  },
  { name: 'single-quoted string', text: "{'a': 1}", code: 'single-quote-not-allowed', line: 1, column: 2, hint: 'relaxed' },
  {
    name: 'unquoted key',
    text: '{a: 1}',
    code: 'unquoted-key-not-allowed', line: 1, column: 2, expected: ['string', '}'], found: 'a', hint: 'relaxed',
  },
  { name: 'line comment', text: '// note\n1', code: 'comment-not-allowed', line: 1, column: 1, hint: 'relaxed' },
  { name: 'block comment between items', text: '[1, /* two */ 2]', code: 'comment-not-allowed', line: 1, column: 5, hint: 'relaxed' },
  {
    name: 'error on the third line after CRLF line breaks',
    text: '{\r\n  "a": 1,\r\n  "b": tru\r\n}',
    code: 'unexpected-token', line: 3, column: 8, expected: ['value'], found: 'tru',
  },
  { name: 'error after lone CR line breaks', text: '[1,\r2,\rx]', code: 'unexpected-token', line: 3, column: 1, expected: ['value'], found: 'x' },
  { name: 'columns count UTF-16 code units', text: `["${EMOJI}", x]`, code: 'unexpected-token', line: 1, column: 8, expected: ['value'], found: 'x' },
  { name: 'the first error in reading order wins', text: '["a\\x", 01]', code: 'invalid-escape', line: 1, column: 4, found: '\\x' },
  {
    name: `more than ${MAX_DEPTH} nested arrays`,
    text: '['.repeat(MAX_DEPTH + 1) + ']'.repeat(MAX_DEPTH + 1),
    code: 'too-deep', line: 1, column: MAX_DEPTH + 1, limit: MAX_DEPTH,
  },
];

/** Reference offset of a 1-based line and column, where \r\n, \n and \r each end a line. */
function offsetOf(text, line, column) {
  const breaks = [...text.matchAll(/\r\n|\r|\n/g)];
  const previous = breaks[line - 2];
  const lineStart = previous === undefined ? 0 : previous.index + previous[0].length;
  return lineStart + column - 1;
}

function errorOf(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  return assert.fail('expected a syntax error');
}

describe('invalid documents', () => {
  it(`has at least 20 cases with exact positions (${INVALID.length})`, () => {
    assert.ok(INVALID.length >= 20);
  });

  for (const { name, text, ...want } of INVALID) {
    it(name, () => {
      const error = errorOf(() => parse(text));
      assert.ok(error instanceof JsonSyntaxError);
      assert.equal(error.code, want.code);
      assert.equal(error.line, want.line, 'line');
      assert.equal(error.column, want.column, 'column');
      assert.equal(error.offset, offsetOf(text, want.line, want.column), 'offset');
      assert.equal(error.hint, want.hint ?? null, 'hint');
      if ('expected' in want) assert.deepStrictEqual(error.expected, want.expected);
      if ('found' in want) assert.equal(error.found, want.found);
      if ('limit' in want) assert.equal(error.limit, want.limit);
    });
  }
});

describe('error details', () => {
  it('put the sentence and the location in the message', () => {
    const error = errorOf(() => parse('[1 2]'));
    assert.equal(error.message, "Expected ',' or ']' but found '2' (Line 1, column 4)");
    assert.equal(error.name, 'JsonSyntaxError');
    assert.ok(error instanceof SyntaxError);
  });

  it('shorten a long offending token', () => {
    const error = errorOf(() => parse(`[${'x'.repeat(40)}]`));
    assert.equal(error.found, `${'x'.repeat(23)}…`);
  });
});

describe('relaxed mode', () => {
  const cases = [
    { text: '[1 2]', code: 'unexpected-token', column: 4, expected: [',', ']'] },
    { text: '{a b}', code: 'unexpected-token', column: 4, expected: [':'] },
    { text: '{1: 2}', code: 'unexpected-token', column: 2, expected: ['name', '}'] },
    { text: '{"a": 1, }x', code: 'unexpected-token', column: 11, expected: ['eof'] },
    { text: '[1,,2]', code: 'unexpected-token', column: 4, expected: ['value'] },
    { text: '[1 /* never closed', code: 'unterminated-comment', column: 4, expected: ['*/'] },
    { text: "['abc", code: 'unterminated-string', column: 6, expected: ["'"] },
  ];

  for (const { text, ...want } of cases) {
    it(`still rejects ${JSON.stringify(text)} at the exact position`, () => {
      const error = errorOf(() => parse(text, { relaxed: true }));
      assert.ok(error instanceof JsonSyntaxError);
      assert.deepStrictEqual(
        { code: error.code, line: error.line, column: error.column, expected: error.expected },
        { ...want, line: 1 },
      );
    });
  }
});
