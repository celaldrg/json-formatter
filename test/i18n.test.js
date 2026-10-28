import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { errorLocation, errorMessage, LANGUAGES, otherLanguage, STRINGS, t } from '../src/i18n.js';
import { parse } from '../src/parser.js';
import { compileQuery } from '../src/query.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

/** The error thrown by `run`. */
function caught(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  return assert.fail('expected an error');
}

/** One way to produce each error code of the parser and the query box. */
const ERRORS = {
  'unexpected-token': () => parse('[1 2]'),
  'unexpected-end': () => parse('['),
  'unterminated-string': () => parse('"abc'),
  'invalid-escape': () => parse('"\\q"'),
  'invalid-unicode-escape': () => parse('"\\u12G4"'),
  'control-character': () => parse('"a\tb"'),
  'invalid-number': () => parse('-'),
  'leading-zero': () => parse('01'),
  'comment-not-allowed': () => parse('// c\n1'),
  'single-quote-not-allowed': () => parse("'a'"),
  'unquoted-key-not-allowed': () => parse('{a: 1}'),
  'trailing-comma-not-allowed': () => parse('[1,]'),
  'unterminated-comment': () => parse('1 /* c', { relaxed: true }),
  'too-deep': () => parse('['.repeat(1001)),
  'query-syntax': () => compileQuery('$.'),
};

describe('STRINGS', () => {
  it('defines the same keys, in the same order, with the same placeholders in every language', () => {
    assert.deepStrictEqual(LANGUAGES, ['en', 'tr']);
    assert.deepStrictEqual(Object.keys(STRINGS), LANGUAGES);
    const keys = Object.keys(STRINGS.en);
    for (const lang of LANGUAGES) {
      assert.deepStrictEqual(Object.keys(STRINGS[lang]), keys, lang);
      for (const key of keys) {
        const text = STRINGS[lang][key];
        assert.ok(typeof text === 'string' && text.trim() !== '', `${lang} ${key}`);
        assert.deepStrictEqual(placeholders(text), placeholders(STRINGS.en[key]), `${lang} ${key}`);
      }
    }
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(STRINGS) && Object.isFrozen(STRINGS.en) && Object.isFrozen(STRINGS.tr));
  });

  it('names every kind of relaxed fix', () => {
    const { repairs } = parse("{a: 'x', /* c */ \"b\": [1,],}", { relaxed: true });
    const kinds = [...new Set(repairs.map((item) => item.kind))].sort();
    assert.deepStrictEqual(kinds, ['comment', 'single-quote', 'trailing-comma', 'unquoted-key']);
    for (const lang of LANGUAGES) {
      for (const kind of kinds) assert.ok(Object.hasOwn(STRINGS[lang], `repair.${kind}`), `${lang} ${kind}`);
    }
  });

  it('has a message for exactly the error codes the parser and the query box produce', () => {
    const messageKeys = Object.keys(STRINGS.en).filter((key) => key.startsWith('error.') && !['error.location', 'error.hint.relaxed'].includes(key));
    assert.deepStrictEqual(messageKeys.map((key) => key.slice('error.'.length)).sort(), Object.keys(ERRORS).sort());
  });
});

describe('t', () => {
  it('fills placeholders', () => {
    assert.equal(t('en', 'query.matches', { count: 3 }), 'Matches: 3');
    assert.equal(t('tr', 'diff.summary', { added: 1, removed: 0, changed: 2 }), '1 eklendi · 0 silindi · 2 değişti');
  });

  it('falls back to English for unknown languages and shows unknown keys as they are', () => {
    assert.equal(t('de', 'action.format'), 'Format');
    assert.equal(t('tr', 'action.format'), 'Biçimlendir');
    assert.equal(t('en', 'no.such.key'), 'no.such.key');
  });

  it('leaves placeholders without a value visible', () => {
    assert.equal(t('en', 'query.matches'), 'Matches: {count}');
    assert.equal(t('en', 'tree.copied', Object.create({ path: 'inherited' })), 'Copied {path}');
  });

  it('ignores names inherited from Object.prototype', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(t(name, 'action.copy'), 'Copy');
      assert.equal(t('en', name), name);
    }
  });

  it('labels the language toggle with the language it switches to', () => {
    assert.deepStrictEqual([otherLanguage('en'), otherLanguage('tr'), otherLanguage('xx')], ['tr', 'en', 'tr']);
    for (const lang of LANGUAGES) assert.equal(t(lang, 'lang.toggle'), otherLanguage(lang).toUpperCase());
  });
});

describe('errorMessage and errorLocation', () => {
  it('lists what was expected with "or" and quotes what was found', () => {
    const error = caught(ERRORS['unexpected-token']);
    assert.equal(errorMessage(error, 'en'), "Expected ',' or ']' but found '2'");
    assert.equal(errorMessage(error, 'tr'), "',' veya ']' bekleniyordu ama '2' bulundu");
    const three = { code: 'unexpected-token', expected: ['value', ',', ']'], found: 'x' };
    assert.equal(errorMessage(three, 'en'), "Expected a value, ',' or ']' but found 'x'");
    assert.equal(errorMessage(three, 'tr'), "bir değer, ',' veya ']' bekleniyordu ama 'x' bulundu");
  });

  it('shows a string from the input with its own quotes and never lets quotes clash', () => {
    const message = (text, options) => errorMessage(caught(() => parse(text, options)), 'en');
    assert.equal(message('{"a": 1\n "private": 2}'), `Expected ',' or '}' but found "private"`);
    assert.equal(errorMessage(caught(() => parse('{"a": 1 "b": 2}')), 'tr'), `',' veya '}' bekleniyordu ama "b" bulundu`);
    assert.equal(message(`[1 "${'x'.repeat(40)}"]`), `Expected ',' or ']' but found "${'x'.repeat(22)}…`);
    assert.equal(message(`["a" 'b']`, { relaxed: true }), `Expected ',' or ']' but found 'b'`);
    assert.equal(message(`["a" 'b']`), `Expected ',' or ']' but found "'"`);
    assert.equal(message(`"\\u12'4"`), `Invalid \\u escape: expected a hex digit but found "'"`);
    assert.equal(message('"\\u12"'), `Invalid \\u escape: expected a hex digit but found '"'`);
    assert.equal(message(`"\\'"`), `Invalid escape sequence "\\'" in a string`);
    assert.equal(errorMessage(caught(() => compileQuery("$.'")), 'en'), `Invalid query: expected a property name or '*' but found "'"`);
  });

  it('names the end of the input', () => {
    const error = caught(() => parse(''));
    assert.equal(errorMessage(error, 'en'), 'Unexpected end of input: expected a value');
    assert.equal(errorMessage(error, 'tr'), 'Girdi beklenmedik biçimde bitti: bir değer bekleniyordu');
    const number = caught(() => parse('1e+'));
    assert.equal(errorMessage(number, 'en'), 'Invalid number: expected a digit but found end of input');
    assert.equal(errorMessage(number, 'tr'), 'Geçersiz sayı: bir rakam bekleniyordu ama girdinin sonu bulundu');
  });

  it('describes the other codes in both languages', () => {
    assert.equal(errorMessage(caught(ERRORS['too-deep']), 'en'), 'Nesting is deeper than 1000 levels');
    assert.equal(errorMessage(caught(ERRORS['too-deep']), 'tr'), 'İç içe yapı 1000 düzeyden derin');
    assert.equal(errorMessage(caught(ERRORS['control-character']), 'en'), "Control character 'U+0009' must be escaped inside a string");
    assert.equal(errorMessage(caught(ERRORS['invalid-escape']), 'en'), "Invalid escape sequence '\\q' in a string");
    assert.equal(errorMessage(caught(ERRORS['unquoted-key-not-allowed']), 'en'), "Property names must be double-quoted in strict JSON: found 'a'");
    assert.equal(
      errorMessage(caught(() => compileQuery('$[x]')), 'tr'),
      "Geçersiz sorgu: '*', bir dizi indisi veya bir dize bekleniyordu ama 'x' bulundu",
    );
  });

  it('gives every error a complete sentence and a location in both languages', () => {
    for (const [code, run] of Object.entries(ERRORS)) {
      const error = caught(run);
      assert.equal(error.code, code);
      for (const lang of LANGUAGES) {
        const message = errorMessage(error, lang);
        assert.ok(!/\{\w+\}/.test(message) && message !== `error.${code}`, `${lang} ${code}: ${message}`);
        assert.match(errorLocation(error, lang), /^(Line|Satır) \d+, (column|sütun) \d+$/);
      }
      if (error.hint) assert.notEqual(t('tr', `error.hint.${error.hint}`), `error.hint.${error.hint}`, code);
    }
  });

  it('writes the English sentence and location into the error message', () => {
    for (const code of ['unexpected-token', 'too-deep', 'invalid-unicode-escape']) {
      const error = caught(ERRORS[code]);
      assert.equal(error.message, `${errorMessage(error, 'en')} (${errorLocation(error, 'en')})`);
    }
  });

  it('formats the location', () => {
    assert.equal(errorLocation({ line: 3, column: 14 }, 'en'), 'Line 3, column 14');
    assert.equal(errorLocation({ line: 3, column: 14 }, 'tr'), 'Satır 3, sütun 14');
  });
});
