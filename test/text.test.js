import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendPath, formatPath, ROOT_PATH } from '../src/path.js';
import {
  charAt,
  describeChar,
  isDigit,
  isHexDigit,
  isIdentifierName,
  isIdentifierPart,
  isIdentifierStart,
  quoteString,
  truncate,
} from '../src/text.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const EMOJI = String.fromCodePoint(0x1f600);
const unit = (code) => String.fromCharCode(code);

describe('digits', () => {
  it('recognises ASCII digits and hex digits only', () => {
    for (let code = 0; code < 0x80; code++) {
      assert.equal(isDigit(code), /[0-9]/.test(unit(code)), `digit ${code}`);
      assert.equal(isHexDigit(code), /[0-9A-Fa-f]/.test(unit(code)), `hex ${code}`);
    }
    for (const code of [Number.NaN, 0x660, 0xff10]) assert.deepStrictEqual([isDigit(code), isHexDigit(code)], [false, false]);
  });
});

describe('charAt', () => {
  it('returns whole code points and an empty string past the end', () => {
    const text = `a${EMOJI}b`;
    assert.deepStrictEqual([0, 1, 2, 3, 4].map((index) => charAt(text, index)), ['a', EMOJI, unit(0xde00), 'b', '']);
  });
});

describe('identifiers', () => {
  it('starts names with letters, $ and _ from any script', () => {
    for (const char of ['a', 'Z', '$', '_', 'ş', 'é', 'İ', 'ß', '中']) assert.equal(isIdentifierStart(char), true, char);
    for (const char of ['1', '-', ' ', '"', EMOJI, '', unit(0x200c), unit(0x301)]) assert.equal(isIdentifierStart(char), false, char);
  });

  it('continues names with digits, combining marks and joiners too', () => {
    for (const char of ['a', '1', '$', '_', unit(0x301), unit(0x200c), unit(0x200d)]) assert.equal(isIdentifierPart(char), true, char);
    for (const char of ['-', ' ', '.', EMOJI]) assert.equal(isIdentifierPart(char), false, char);
  });

  it('tells which names need no quotes', () => {
    for (const name of ['name', '$ref', '_id', 'a1', 'şehir', 'café', 'null', 'true', `e${unit(0x301)}`, '中文']) {
      assert.equal(isIdentifierName(name), true, name);
    }
    for (const name of ['', '1a', 'first name', 'a-b', 'a.b', EMOJI, '"', unit(0xd800), `a${unit(0xd800)}`]) {
      assert.equal(isIdentifierName(name), false, name);
    }
  });
});

describe('quoteString', () => {
  it('matches JSON.stringify for every single UTF-16 code unit', () => {
    const different = [];
    for (let code = 0; code <= 0xffff; code++) {
      if (quoteString(unit(code)) !== JSON.stringify(unit(code))) different.push(code);
    }
    assert.deepStrictEqual(different, []);
  });

  it('matches JSON.stringify for pairs, broken pairs and mixed strings', () => {
    const fixed = ['', 'plain', 'say "hi" \\ bye', EMOJI, unit(0xde00) + unit(0xd83d), unit(0xd83d) + EMOJI, `a${unit(0x2028)}b${unit(0x7f)}`];
    for (const text of fixed) assert.equal(quoteString(text), JSON.stringify(text));
    const palette = [0x00, 0x08, 0x1f, 0x20, 0x22, 0x27, 0x2f, 0x41, 0x5c, 0x7f, 0xe9, 0x2028, 0xd800, 0xd83d, 0xdbff, 0xdc00, 0xde00, 0xdfff, 0xfffe];
    let seed = 7;
    const next = (limit) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    for (let round = 0; round < 2000; round++) {
      const text = Array.from({ length: next(12) }, () => unit(palette[next(palette.length)])).join('');
      assert.equal(quoteString(text), JSON.stringify(text));
    }
  });
});

describe('describeChar', () => {
  it('shows visible characters as they are', () => {
    for (const char of ['a', ' ', '@', 'ş', EMOJI]) assert.equal(describeChar(char), char);
  });

  it('shows invisible and space-like characters as U+XXXX', () => {
    const cases = [
      [0x00, 'U+0000'],
      [0x09, 'U+0009'],
      [0x1f, 'U+001F'],
      [0x7f, 'U+007F'],
      [0x85, 'U+0085'],
      [0xa0, 'U+00A0'],
      [0xad, 'U+00AD'],
      [0x200b, 'U+200B'],
      [0x2028, 'U+2028'],
      [0x3000, 'U+3000'],
      [0xfeff, 'U+FEFF'],
      [0xd800, 'U+D800'],
      [0xe0001, 'U+E0001'],
    ];
    for (const [code, shown] of cases) assert.equal(describeChar(String.fromCodePoint(code)), shown);
  });

  it('returns null for the end of the input', () => {
    assert.equal(describeChar(''), null);
  });
});

describe('truncate', () => {
  it('keeps short text and cuts long text with an ellipsis', () => {
    assert.equal(truncate('abc', 3), 'abc');
    assert.equal(truncate('abcd', 3), 'ab…');
  });

  it('never splits a surrogate pair', () => {
    assert.equal(truncate(`a${EMOJI}b`, 3), 'a…');
    assert.equal(truncate(EMOJI + EMOJI, 3), `${EMOJI}…`);
  });
});

describe('paths', () => {
  it('writes plain names with a dot and everything else in brackets', () => {
    assert.equal(ROOT_PATH, '$');
    const cases = [
      ['name', '$.name'],
      [0, '$[0]'],
      ['0', '$["0"]'],
      ['', '$[""]'],
      ['first name', '$["first name"]'],
      ['a"b', '$["a\\"b"]'],
      ['şehir', '$.şehir'],
      [unit(0xd800), '$["\\ud800"]'],
    ];
    for (const [key, path] of cases) assert.equal(appendPath('$', key), path);
  });

  it('joins segments from the root', () => {
    assert.equal(formatPath([]), '$');
    assert.equal(formatPath(['users', 0, 'first name', 2]), '$.users[0]["first name"][2]');
  });
});
