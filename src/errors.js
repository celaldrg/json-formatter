import { errorLocation, errorMessage } from './i18n.js';

/**
 * @typedef {Object} SyntaxErrorDetails
 * @property {string} code machine-readable reason, e.g. 'unexpected-token' (see the `error.*` strings)
 * @property {number} offset 0-based UTF-16 offset of the problem
 * @property {number} line 1-based line (\n, \r\n and \r end a line)
 * @property {number} column 1-based column in UTF-16 code units
 * @property {string[]} [expected] what would have been valid there: punctuation such as ',' or
 *   kinds such as 'value', 'string', 'name', 'digit', 'hex', 'eof'
 * @property {string|null} [found] the offending text, or null for the end of input
 * @property {string|null} [hint] 'relaxed' when Relaxed mode would accept the input
 * @property {number|null} [limit] the nesting limit, for 'too-deep'
 */

/** A JSON syntax error with an exact position and what was expected there. */
export class JsonSyntaxError extends SyntaxError {
  /** @param {SyntaxErrorDetails} details */
  constructor(details) {
    super(`${errorMessage(details, 'en')} (${errorLocation(details, 'en')})`);
    this.name = 'JsonSyntaxError';
    this.code = details.code;
    this.offset = details.offset;
    this.line = details.line;
    this.column = details.column;
    this.expected = details.expected ?? [];
    this.found = details.found ?? null;
    this.hint = details.hint ?? null;
    this.limit = details.limit ?? null;
  }
}
