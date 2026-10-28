import { isIdentifierName, quoteString } from './text.js';

/** Path of the document root. */
export const ROOT_PATH = '$';

/**
 * Appends one step to a path: `.name` for plain names, `["odd key"]` otherwise, `[3]` for indexes.
 * The result is also a valid query, so a copied path can be pasted into the query box.
 * @param {string} path
 * @param {string|number} key member name or array index
 * @returns {string}
 */
export function appendPath(path, key) {
  if (typeof key === 'number') return `${path}[${key}]`;
  return isIdentifierName(key) ? `${path}.${key}` : `${path}[${quoteString(key)}]`;
}

/**
 * @param {Array<string|number>} segments member names and array indexes from the root
 * @returns {string} e.g. `$.users[0]["first name"]`
 */
export function formatPath(segments) {
  return segments.reduce((path, key) => appendPath(path, key), ROOT_PATH);
}
