import { charAt, describeChar, isDigit, isHexDigit, isIdentifierPart, isIdentifierStart } from './text.js';

const PUNCTUATION = '{}[]:,';
const ESCAPES = Object.freeze({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' });
const LF = 0x0a;
const CR = 0x0d;
const BACKSLASH = 0x5c;

/**
 * @typedef {Object} Token
 * @property {string} type '{' '}' '[' ']' ':' ',' 'string' 'number' 'word' 'invalid' or 'eof'
 * @property {number} start offset of the first character
 * @property {number} end offset after the last character
 * @property {number} line 1-based line of `start`
 * @property {number} column 1-based column of `start`
 * @property {*} [value] decoded string, number value or word text
 * @property {string} [quote] '"' or "'" for strings
 * @property {import('./errors.js').SyntaxErrorDetails} [error] set when the token is malformed
 */

/**
 * @typedef {Object} CommentRecord
 * @property {'comment'} kind
 * @property {number} start
 * @property {number} end
 * @property {number} line
 * @property {number} column
 * @property {string} text replacement text (always '': comments are removed)
 */

/**
 * On-demand tokenizer. It never throws: a malformed token carries an `error` that the parser
 * raises only when it accepts that token, so the first problem in reading order is reported.
 * Relaxed mode also skips // and block comments and reads single-quoted strings.
 */
export class Lexer {
  /**
   * @param {string} text
   * @param {boolean} relaxed
   * @param {number} [start] offset to start reading from (positions stay relative to `text`)
   */
  constructor(text, relaxed, start = 0) {
    this.text = text;
    this.relaxed = relaxed;
    this.pos = start;
    this.line = 1;
    this.lineStart = 0;
    /** @type {CommentRecord[]} comments skipped so far (relaxed mode only) */
    this.comments = [];
  }

  /**
   * Reads the next token after any whitespace and comments.
   * @returns {Token}
   */
  next() {
    const problem = this.skipTrivia();
    if (problem) return problem;
    const token = this.startToken();
    if (this.pos >= this.text.length) return token;
    const char = charAt(this.text, this.pos);
    if (PUNCTUATION.includes(char)) return this.finish(token, char, this.pos + 1);
    if (char === '"' || char === "'") return this.scanString(token, char);
    if (char === '-' || isDigit(char.charCodeAt(0))) return this.scanNumber(token);
    if (isIdentifierStart(char)) return this.scanWord(token);
    return this.finish(token, 'invalid', this.pos + char.length);
  }

  startToken() {
    return { type: 'eof', start: this.pos, end: this.pos, line: this.line, column: this.pos - this.lineStart + 1 };
  }

  finish(token, type, end) {
    token.type = type;
    token.end = end;
    this.pos = end;
    return token;
  }

  /** Details for a problem at `offset`, which must lie on the current line. */
  problem(offset, details) {
    return { expected: [], found: null, hint: null, ...details, offset, line: this.line, column: offset - this.lineStart + 1 };
  }

  /** Advances one unit and keeps line bookkeeping: \n, \r\n and a lone \r each end a line. */
  step() {
    const code = this.text.charCodeAt(this.pos++);
    if (code === LF || (code === CR && this.text.charCodeAt(this.pos) !== LF)) {
      this.line++;
      this.lineStart = this.pos;
    }
  }

  /** Skips whitespace and comments; returns an invalid token when a comment is not allowed. */
  skipTrivia() {
    const { text } = this;
    while (this.pos < text.length) {
      const code = text.charCodeAt(this.pos);
      if (code === 0x20 || code === 0x09 || code === LF || code === CR) {
        this.step();
      } else if (code === 0x2f && (text[this.pos + 1] === '/' || text[this.pos + 1] === '*')) {
        const problem = this.skipComment();
        if (problem) return problem;
      } else {
        break;
      }
    }
    return null;
  }

  skipComment() {
    const token = this.startToken();
    token.type = 'invalid';
    token.end = this.pos + 2;
    if (!this.relaxed) {
      token.error = this.problem(token.start, { code: 'comment-not-allowed', hint: 'relaxed' });
      return token;
    }
    const end = this.commentEnd();
    if (end < 0) {
      token.error = this.problem(token.start, { code: 'unterminated-comment', expected: ['*/'] });
      return token;
    }
    while (this.pos < end) this.step();
    this.comments.push({ kind: 'comment', start: token.start, end, line: token.line, column: token.column, text: '' });
    return null;
  }

  /** End offset of the comment starting at `pos`, or -1 for an unclosed block comment. */
  commentEnd() {
    const { text, pos } = this;
    if (text[pos + 1] === '*') {
      const close = text.indexOf('*/', pos + 2);
      return close < 0 ? -1 : close + 2;
    }
    let end = pos + 2;
    while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;
    return end;
  }

  scanString(token, quote) {
    token.type = 'string';
    token.quote = quote;
    if (quote === "'" && !this.relaxed) {
      token.error = this.problem(this.pos, { code: 'single-quote-not-allowed', hint: 'relaxed' });
      return this.finish(token, 'string', this.pos + 1);
    }
    const { text } = this;
    let value = '';
    let chunk = ++this.pos;
    while (!token.error) {
      const code = text.charCodeAt(this.pos);
      if (this.pos >= text.length || code === LF || code === CR) {
        token.error = this.problem(this.pos, { code: 'unterminated-string', expected: [quote] });
      } else if (text[this.pos] === quote) {
        value += text.slice(chunk, this.pos++);
        break;
      } else if (code === BACKSLASH) {
        value += text.slice(chunk, this.pos);
        value += this.scanEscape(token, quote);
        chunk = this.pos;
      } else if (code < 0x20) {
        token.error = this.problem(this.pos, { code: 'control-character', found: describeChar(text[this.pos]) });
      } else {
        this.pos++;
      }
    }
    token.value = value;
    token.end = this.pos;
    return token;
  }

  /** Reads the escape at `pos` (a backslash) and returns its text, or '' after recording an error. */
  scanEscape(token, quote) {
    const { text } = this;
    const start = this.pos;
    const marker = text[start + 1];
    if (marker === undefined || marker === '\n' || marker === '\r') {
      this.pos = start + 1; // the string loop reports the missing closing quote here
      return '';
    }
    if (Object.hasOwn(ESCAPES, marker) || (marker === "'" && quote === "'")) {
      this.pos = start + 2;
      return ESCAPES[marker] ?? "'";
    }
    if (marker === 'u') return this.scanUnicodeEscape(token, start);
    token.error = this.problem(start, { code: 'invalid-escape', found: `\\${describeChar(charAt(text, start + 1))}` });
    return '';
  }

  scanUnicodeEscape(token, start) {
    const { text } = this;
    for (let index = start + 2; index < start + 6; index++) {
      if (!isHexDigit(text.charCodeAt(index))) {
        const found = describeChar(charAt(text, index));
        token.error = this.problem(index, { code: 'invalid-unicode-escape', expected: ['hex'], found });
        return '';
      }
    }
    this.pos = start + 6;
    return String.fromCharCode(Number.parseInt(text.slice(start + 2, start + 6), 16));
  }

  scanNumber(token) {
    token.type = 'number';
    const { text } = this;
    if (text[this.pos] === '-') this.pos++;
    if (text[this.pos] === '0') {
      this.pos++;
      if (isDigit(text.charCodeAt(this.pos))) return this.badNumber(token, 'leading-zero', []);
    } else if (!this.skipDigits()) {
      return this.badNumber(token, 'invalid-number', ['digit']);
    }
    if (text[this.pos] === '.') {
      this.pos++;
      if (!this.skipDigits()) return this.badNumber(token, 'invalid-number', ['digit']);
    }
    if (text[this.pos] === 'e' || text[this.pos] === 'E') {
      this.pos++;
      if (text[this.pos] === '+' || text[this.pos] === '-') this.pos++;
      if (!this.skipDigits()) return this.badNumber(token, 'invalid-number', ['digit']);
    }
    token.end = this.pos;
    token.value = Number(text.slice(token.start, this.pos));
    return token;
  }

  skipDigits() {
    const from = this.pos;
    while (isDigit(this.text.charCodeAt(this.pos))) this.pos++;
    return this.pos > from;
  }

  badNumber(token, code, expected) {
    const found = describeChar(charAt(this.text, this.pos));
    token.error = this.problem(this.pos, { code, expected, found });
    token.end = this.pos;
    return token;
  }

  scanWord(token) {
    let end = this.pos;
    for (let char = charAt(this.text, end); char !== '' && isIdentifierPart(char); char = charAt(this.text, end)) {
      end += char.length;
    }
    token.value = this.text.slice(token.start, end);
    return this.finish(token, 'word', end);
  }
}
