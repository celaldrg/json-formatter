import { quoteString, truncate } from './text.js';

/**
 * @typedef {'punctuation'|'whitespace'|'key'|'string'|'number'|'boolean'|'null'} SegmentKind
 * @typedef {{kind: SegmentKind, text: string}} Segment
 * @typedef {2|4|'tab'|number} Indent spaces per level, 'tab', or 0 to minify
 * @typedef {{indent?: Indent, sortKeys?: boolean}} FormatOptions
 */

/** Indent choices offered by the UI. */
export const INDENTS = Object.freeze([2, 4, 'tab']);

const MAX_INDENT = 8;

/**
 * Formats an AST as strict JSON, split into kinds for syntax highlighting.
 * Joining the texts gives exactly `format(node, options)`.
 * @param {import('./parser.js').Node} node
 * @param {FormatOptions} [options]
 * @returns {Segment[]}
 */
export function formatSegments(node, options = {}) {
  const out = render(node, options, Infinity);
  return out.kinds.map((kind, index) => ({ kind, text: out.texts[index] }));
}

/**
 * Formats an AST as strict JSON in the style of JSON.stringify(value, null, indent);
 * indent 0 minifies. Numbers keep their source text, so 12345678901234567890 or 1.10 never
 * lose digits; strict strings keep their escapes; relaxed strings and keys are re-quoted.
 * @param {import('./parser.js').Node} node
 * @param {FormatOptions} [options] indent defaults to 2; sortKeys sorts members at every level
 * @returns {string}
 */
export function format(node, options = {}) {
  return render(node, options, Infinity).texts.join('');
}

/**
 * Short single-line JSON for labels, cut with an ellipsis; stops early on large values.
 * @param {import('./parser.js').Node} node
 * @param {number} [maxLength]
 * @returns {string}
 */
export function preview(node, maxLength = 60) {
  return truncate(render(node, { indent: 0 }, maxLength).texts.join(''), maxLength);
}

/** The strict JSON literal of a string node: its source text, or a re-quoted relaxed string. */
function stringLiteral(node) {
  return node.relaxed ? quoteString(node.value) : node.raw;
}

function render(node, { indent = 2, sortKeys = false }, limit) {
  const out = new Writer(limit);
  writeValue(node, out, { unit: indentUnit(indent), sortKeys, pads: [''] }, 0);
  return out;
}

function indentUnit(indent) {
  if (indent === 'tab' || indent === '\t') return '\t';
  if (Number.isInteger(indent) && indent >= 0 && indent <= MAX_INDENT) return ' '.repeat(indent);
  throw new RangeError(`Unsupported indent: ${String(indent)}`);
}

class Writer {
  constructor(limit) {
    this.kinds = [];
    this.texts = [];
    this.length = 0;
    this.limit = limit;
  }

  get full() {
    return this.length > this.limit;
  }

  write(kind, text) {
    this.kinds.push(kind);
    this.texts.push(text);
    this.length += text.length;
  }
}

function writeValue(node, out, style, level) {
  if (node.type === 'object' || node.type === 'array') writeContainer(node, out, style, level);
  else out.write(node.type, node.type === 'string' ? stringLiteral(node) : node.raw);
}

function writeContainer(node, out, style, level) {
  const isObject = node.type === 'object';
  const entries = isObject ? orderedMembers(node.members, style.sortKeys) : node.items;
  const [open, close] = isObject ? ['{', '}'] : ['[', ']'];
  if (entries.length === 0) {
    out.write('punctuation', open + close);
    return;
  }
  out.write('punctuation', open);
  for (let index = 0; index < entries.length && !out.full; index++) {
    if (index > 0) out.write('punctuation', ',');
    newline(out, style, level + 1);
    const entry = entries[index];
    if (isObject) writeKey(entry.key, out, style);
    writeValue(isObject ? entry.value : entry, out, style, level + 1);
  }
  newline(out, style, level);
  out.write('punctuation', close);
}

function writeKey(key, out, style) {
  out.write('key', stringLiteral(key));
  out.write('punctuation', ':');
  if (style.unit) out.write('whitespace', ' ');
}

function newline(out, style, level) {
  if (!style.unit) return;
  style.pads[level] ??= style.unit.repeat(level);
  out.write('whitespace', `\n${style.pads[level]}`);
}

/** Members sorted by name (UTF-16 order) when asked; the sort is stable, so duplicates keep their order. */
function orderedMembers(members, sortKeys) {
  if (!sortKeys) return members;
  return [...members].sort((a, b) => compareNames(a.key.value, b.key.value));
}

function compareNames(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
