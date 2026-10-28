import { JsonSyntaxError } from './errors.js';
import { Lexer } from './lexer.js';
import { charAt, describeChar, quoteString, truncate } from './text.js';

/** Deepest nesting of arrays and objects that is accepted; deeper input fails with 'too-deep'. */
export const MAX_DEPTH = 1000;

const LITERALS = Object.freeze({ true: ['boolean', true], false: ['boolean', false], null: ['null', null] });
const EXCERPT_LENGTH = 24;

/**
 * @typedef {Object} Node
 * @property {'object'|'array'|'string'|'number'|'boolean'|'null'} type
 * @property {number} start offset of the first character
 * @property {number} end offset after the last character
 * @property {number} line 1-based line of `start`
 * @property {number} column 1-based column of `start`
 * @property {Member[]} [members] object members in source order (duplicates kept)
 * @property {Node[]} [items] array items
 * @property {*} [value] decoded scalar value (numbers may be rounded; see `raw`)
 * @property {string} [raw] scalar source text; numbers are always formatted from it
 * @property {boolean} [relaxed] strings only: written in relaxed syntax, so `raw` is not strict JSON
 */

/**
 * @typedef {Object} Member
 * @property {Node} key a string node
 * @property {Node} value
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef {Object} Repair a relaxed construct that strict JSON does not allow
 * @property {'comment'|'trailing-comma'|'single-quote'|'unquoted-key'} kind
 * @property {number} start
 * @property {number} end
 * @property {number} line
 * @property {number} column
 * @property {string} text strict replacement for [start, end) ('' means delete)
 */

/**
 * Parses JSON text into an AST with source positions. Strict mode follows RFC 8259 exactly;
 * relaxed mode also accepts comments, trailing commas, single-quoted strings and unquoted keys
 * and lists each of them in `repairs`.
 * @param {string} text
 * @param {{relaxed?: boolean}} [options]
 * @returns {{ast: Node, repairs: Repair[]}}
 * @throws {JsonSyntaxError} at the first problem, with line, column and the expected tokens
 */
export function parse(text, { relaxed = false } = {}) {
  if (typeof text !== 'string') throw new TypeError('parse() expects a string');
  return new Parser(text, relaxed).parseDocument();
}

/**
 * Like parse(), but reports syntax errors as a value instead of throwing.
 * @param {string} text
 * @param {{relaxed?: boolean}} [options]
 * @returns {{ok: true, ast: Node, repairs: Repair[]} | {ok: false, error: JsonSyntaxError}}
 */
export function tryParse(text, options) {
  try {
    return { ok: true, ...parse(text, options) };
  } catch (error) {
    if (error instanceof JsonSyntaxError) return { ok: false, error };
    throw error;
  }
}

class Parser {
  constructor(text, relaxed) {
    this.text = text;
    this.relaxed = relaxed;
    this.lexer = new Lexer(text, relaxed);
    /** @type {Repair[]} */
    this.repairs = [];
    this.token = this.lexer.next();
  }

  parseDocument() {
    const ast = this.parseValue(0);
    if (this.token.type !== 'eof') this.fail(['eof']);
    const repairs = [...this.lexer.comments, ...this.repairs].sort((a, b) => a.start - b.start);
    return { ast, repairs };
  }

  parseValue(depth, expected = ['value']) {
    const { token } = this;
    if (token.type === '{') return this.parseObject(depth + 1);
    if (token.type === '[') return this.parseArray(depth + 1);
    if (token.type === 'string') return this.parseString();
    if (token.type === 'number') return this.scalar('number', this.take());
    if (token.type === 'word' && Object.hasOwn(LITERALS, token.value)) return this.parseLiteral();
    return this.fail(expected);
  }

  parseArray(depth) {
    const open = this.enter(depth);
    const items = [];
    while (this.hasNextEntry(']', items.length, ['value'])) {
      items.push(this.parseValue(depth, items.length === 0 ? ['value', ']'] : ['value']));
    }
    return this.container('array', open, this.take(), { items });
  }

  parseObject(depth) {
    const open = this.enter(depth);
    const members = [];
    const name = this.relaxed ? 'name' : 'string';
    while (this.hasNextEntry('}', members.length, [name])) {
      const key = this.parseKey(members.length === 0 ? [name, '}'] : [name]);
      this.expect(':', [':']);
      const value = this.parseValue(depth);
      members.push({ key, value, start: key.start, end: value.end });
    }
    return this.container('object', open, this.take(), { members });
  }

  /**
   * Inside a container closed by `close`, consumes the comma before the next entry and tells
   * whether one follows. Returns false with the closing bracket as the current token.
   */
  hasNextEntry(close, count, expectedAfterComma) {
    if (count === 0) return this.token.type !== close;
    if (this.token.type === close) return false;
    const comma = this.expect(',', [',', close]);
    if (this.token.type !== close) return true;
    this.trailingComma(comma, expectedAfterComma);
    return false;
  }

  parseKey(expected) {
    const { token } = this;
    if (token.type === 'string') return this.parseString();
    if (token.type !== 'word') return this.fail(expected);
    if (!this.relaxed) {
      throw this.error(token, { code: 'unquoted-key-not-allowed', expected, found: token.value, hint: 'relaxed' });
    }
    this.take();
    this.repairs.push(this.repair('unquoted-key', token, quoteString(token.value)));
    return this.scalar('string', token, true);
  }

  parseString() {
    const token = this.take();
    const relaxed = token.quote !== '"';
    if (relaxed) this.repairs.push(this.repair('single-quote', token, quoteString(token.value)));
    return this.scalar('string', token, relaxed);
  }

  parseLiteral() {
    const token = this.take();
    const [type, value] = LITERALS[token.value];
    return { type, value, raw: token.value, ...this.position(token) };
  }

  /** Consumes an opening bracket, refusing to nest deeper than MAX_DEPTH. */
  enter(depth) {
    if (depth > MAX_DEPTH) throw this.error(this.token, { code: 'too-deep', limit: MAX_DEPTH });
    return this.take();
  }

  trailingComma(comma, expected) {
    if (!this.relaxed) {
      throw this.error(comma, { code: 'trailing-comma-not-allowed', expected, found: this.token.type, hint: 'relaxed' });
    }
    this.repairs.push(this.repair('trailing-comma', comma, ''));
  }

  /** Returns the current token and reads the next one; raises the token's own error first. */
  take() {
    const { token } = this;
    if (token.error) throw new JsonSyntaxError(token.error);
    this.token = this.lexer.next();
    return token;
  }

  expect(type, expected) {
    if (this.token.type !== type) this.fail(expected);
    return this.take();
  }

  fail(expected) {
    const { token } = this;
    if (token.type === 'invalid' && token.error) throw new JsonSyntaxError(token.error);
    if (token.type === 'eof') throw this.error(token, { code: 'unexpected-end', expected });
    throw this.error(token, { code: 'unexpected-token', expected, found: this.excerpt(token) });
  }

  error(token, details) {
    return new JsonSyntaxError({ ...details, offset: token.start, line: token.line, column: token.column });
  }

  /** What the error message shows as found: the token's text, or U+XXXX for an invisible character. */
  excerpt(token) {
    if (token.type === 'invalid') return describeChar(charAt(this.text, token.start));
    return truncate(this.text.slice(token.start, token.end), EXCERPT_LENGTH);
  }

  position(token) {
    return { start: token.start, end: token.end, line: token.line, column: token.column };
  }

  scalar(type, token, relaxed = false) {
    const node = { type, value: token.value, raw: this.text.slice(token.start, token.end), ...this.position(token) };
    if (type === 'string') node.relaxed = relaxed;
    return node;
  }

  container(type, open, close, children) {
    return { type, ...children, start: open.start, end: close.end, line: open.line, column: open.column };
  }

  repair(kind, token, text) {
    return { kind, ...this.position(token), text };
  }
}
