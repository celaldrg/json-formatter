import { isLossyNumber } from './ast.js';
import { preview } from './formatter.js';
import { LANGUAGES } from './i18n.js';
import { Lexer } from './lexer.js';
import { charAt } from './text.js';

/**
 * Pure helpers behind the user interface: text statistics, the window of a virtual list,
 * download names, where an error marker goes, rows for query matches and stored preferences.
 * Nothing here touches the DOM, so the tests can import it.
 */

const LF = 0x0a;
const CR = 0x0d;
const SIZE_UNITS = Object.freeze(['B', 'KB', 'MB', 'GB']);
const MATCH_PREVIEW_LENGTH = 80;

/** Errors raised at the start of a whole token; the marker then covers that token. */
const TOKEN_ERRORS = new Set([
  'unexpected-token',
  'unquoted-key-not-allowed',
  'trailing-comma-not-allowed',
  'comment-not-allowed',
  'single-quote-not-allowed',
  'too-deep',
]);

/** Workspace settings remembered between visits; the documents themselves are never stored. */
export const PREFERENCE_KEYS = Object.freeze(['indent', 'sortKeys', 'relaxed', 'mode']);

/** Share of the width the input pane takes on wide screens, and the keyboard step of the splitter. */
export const SPLIT = Object.freeze({ min: 0.25, max: 0.75, initial: 0.5, step: 0.02 });

/**
 * Counts lines the way the parser numbers them: \n, \r\n and a lone \r each end a line.
 * @param {string} text
 * @returns {number} at least 1
 */
export function countLines(text) {
  let lines = 1;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === LF || (code === CR && text.charCodeAt(index + 1) !== LF)) lines++;
  }
  return lines;
}

/**
 * Size of the text in UTF-8 without encoding it; a lone surrogate counts as U+FFFD (3 bytes),
 * as TextEncoder writes it.
 * @param {string} text
 * @returns {number} bytes
 */
export function utf8Length(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Human-readable size with the language's decimal separator: "512 B", "1.5 KB", "1,5 KB" (tr).
 * @param {number} bytes
 * @param {string} lang
 * @returns {string}
 */
export function formatBytes(bytes, lang) {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: unit === 0 ? 0 : 1, useGrouping: false }).format(value);
  return `${number} ${SIZE_UNITS[unit]}`;
}

/**
 * The slice of a virtual list that is in view, widened by `overscan` items on both sides.
 * @param {{offset: number, viewport: number, itemSize: number, count: number, overscan?: number}} view
 *   offset: scroll position of the first item's top edge; viewport: visible height
 * @returns {{first: number, last: number}} the first index and one past the last
 */
export function visibleRange({ offset, viewport, itemSize, count, overscan = 0 }) {
  if (count <= 0 || !(itemSize > 0)) return { first: 0, last: 0 };
  const first = clamp(Math.floor(offset / itemSize) - overscan, 0, count);
  const last = clamp(Math.ceil((offset + viewport) / itemSize) + overscan, first, count);
  return { first, last };
}

/**
 * Converts \r\n and lone \r to \n, as a textarea does with its value, so that error positions
 * match what the editor shows.
 * @param {string} text
 * @returns {string}
 */
export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * File name for a download: "data.json" becomes "data.formatted.json" or "data.min.json".
 * @param {string|null} fileName the name of the opened file, if any
 * @param {'pretty'|'minify'} mode
 * @returns {string}
 */
export function downloadName(fileName, mode) {
  const base = (fileName ?? '').replace(/\.[^.]*$/, '').trim() || 'document';
  return `${base}.${mode === 'minify' ? 'min' : 'formatted'}.json`;
}

/**
 * Where the editor marks an error: the error's line and the token (or the single character) it
 * points at. The range never runs past the end of the line; it is empty when the error points
 * at a line break or at the end of the input.
 * @param {string} text the text that was parsed
 * @param {{code: string, offset: number, line: number, column: number}} error
 * @param {boolean} relaxed the mode the text was parsed in
 * @returns {{line: number, lineStart: number, lineEnd: number, start: number, end: number}}
 */
export function errorRange(text, error, relaxed) {
  const lineStart = error.offset - (error.column - 1);
  const lineEnd = lineEndAt(text, error.offset);
  const start = Math.min(error.offset, lineEnd);
  let end = start;
  if (start < lineEnd) {
    end = start + charAt(text, start).length;
    if (TOKEN_ERRORS.has(error.code)) {
      const token = new Lexer(text, relaxed, start).next();
      if (token.start === start) end = Math.max(end, token.end);
    }
  }
  return { line: error.line, lineStart, lineEnd, start, end: Math.min(end, lineEnd) };
}

/**
 * Rows for the matches of a query, shaped like tree rows so that the tree view can list them.
 * @param {import('./query.js').Match[]} matches
 * @returns {Array<{node: {path: string, key: string, type: string, depth: number, count: number, preview: string, lossy: boolean}, expanded: boolean}>}
 */
export function matchRows(matches) {
  return matches.map(({ path, node }) => {
    const container = node.type === 'object' || node.type === 'array';
    return {
      node: {
        path,
        key: path,
        type: node.type,
        depth: 0,
        count: node.type === 'object' ? node.members.length : node.type === 'array' ? node.items.length : 0,
        preview: container ? '' : preview(node, MATCH_PREVIEW_LENGTH),
        lossy: node.type === 'number' && isLossyNumber(node.raw),
      },
      expanded: false,
    };
  });
}

/**
 * Reads the stored preferences (strings) into workspace settings; the workspace ignores values
 * it does not accept, so a damaged entry only falls back to the default.
 * @param {(key: string) => string|null} read
 * @returns {Partial<import('./workspace.js').Settings>}
 */
export function readPreferences(read) {
  const preferences = {};
  const indent = read('indent');
  if (indent !== null) preferences.indent = indent === 'tab' ? 'tab' : Number(indent);
  const mode = read('mode');
  if (mode !== null) preferences.mode = mode;
  for (const key of ['sortKeys', 'relaxed']) {
    const value = read(key);
    if (value === 'true' || value === 'false') preferences[key] = value === 'true';
  }
  return preferences;
}

/**
 * @param {string|null} stored
 * @returns {string} a supported language: the stored one, or English
 */
export function pickLanguage(stored) {
  return LANGUAGES.includes(stored) ? stored : LANGUAGES[0];
}

/**
 * @param {number} ratio
 * @returns {number} the ratio kept within SPLIT.min and SPLIT.max
 */
export function clampSplit(ratio) {
  return clamp(ratio, SPLIT.min, SPLIT.max);
}

/**
 * @param {string|null} stored a ratio such as "0.5"
 * @returns {number} the stored ratio within range, or SPLIT.initial
 */
export function parseSplit(stored) {
  const ratio = stored === null || stored.trim() === '' ? Number.NaN : Number(stored);
  return Number.isFinite(ratio) ? clampSplit(ratio) : SPLIT.initial;
}

function lineEndAt(text, offset) {
  for (let index = offset; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === LF || code === CR) return index;
  }
  return text.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}
