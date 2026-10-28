/**
 * Character and string helpers shared by the lexer, the formatter and paths.
 * Positions and lengths are in UTF-16 code units, like JavaScript string indexes.
 */

const ID_START = /^[\p{ID_Start}$_]$/u;
const ID_PART = new RegExp('^[\\p{ID_Continue}$\\u200C\\u200D]$', 'u'); // ZWNJ and ZWJ, as in JavaScript
const ASCII_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const INVISIBLE = /^[\p{C}\p{Z}]$/u; // other (controls, format, surrogates, private use, unassigned) and separators
const ESCAPE_TARGETS = /["\\\u0000-\u001f]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;
const SHORT_ESCAPES = Object.freeze({
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
});

/**
 * @param {number} code UTF-16 code unit (NaN past the end of a string)
 * @returns {boolean} true for 0-9
 */
export function isDigit(code) {
  return code >= 0x30 && code <= 0x39;
}

/**
 * @param {number} code UTF-16 code unit
 * @returns {boolean} true for 0-9, A-F and a-f
 */
export function isHexDigit(code) {
  return isDigit(code) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
}

/**
 * Returns the whole code point starting at `index` (one or two UTF-16 units).
 * @param {string} text
 * @param {number} index
 * @returns {string} the character, or '' past the end
 */
export function charAt(text, index) {
  const code = text.codePointAt(index);
  return code === undefined ? '' : String.fromCodePoint(code);
}

/**
 * @param {string} char a single code point
 * @returns {boolean} true if it may start an unquoted name (letters, `$`, `_`)
 */
export function isIdentifierStart(char) {
  return ID_START.test(char);
}

/**
 * @param {string} char a single code point
 * @returns {boolean} true if it may continue an unquoted name (also digits and marks)
 */
export function isIdentifierPart(char) {
  return ID_PART.test(char);
}

/**
 * Tells whether a property name can be written without quotes, e.g. `$.name` or `{name: 1}`.
 * @param {string} name
 * @returns {boolean}
 */
export function isIdentifierName(name) {
  if (ASCII_IDENTIFIER.test(name)) return true;
  let index = 0;
  for (const char of name) {
    if (!(index === 0 ? isIdentifierStart(char) : isIdentifierPart(char))) return false;
    index++;
  }
  return index > 0;
}

/**
 * Serialises a string as a strict JSON string literal, exactly like JSON.stringify:
 * quotes, backslashes and control characters are escaped and lone surrogates become \u escapes.
 * @param {string} value
 * @returns {string}
 */
export function quoteString(value) {
  return `"${value.replace(ESCAPE_TARGETS, escapeMatch)}"`;
}

function escapeMatch(match) {
  if (match.length === 2) return match; // a well-formed surrogate pair stays as it is
  return SHORT_ESCAPES[match] ?? `\\u${match.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

/**
 * Readable form of one character for error messages. Characters that are invisible or look like
 * a plain space (controls, format characters such as the byte order mark, no-break spaces, line
 * separators, lone surrogates) become U+XXXX, so a stray one pasted from a web page shows up.
 * @param {string} char a single code point, or '' for the end of input
 * @returns {string|null} null for the end of input
 */
export function describeChar(char) {
  if (char === '') return null;
  if (char === ' ' || !INVISIBLE.test(char)) return char;
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Shortens text to at most `max` units, ending with an ellipsis, without splitting a surrogate pair.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  if (text.length <= max) return text;
  let cut = max - 1;
  const last = text.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut--;
  return `${text.slice(0, cut)}…`;
}
