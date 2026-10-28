import { tryParse } from './parser.js';

/**
 * Rewrites relaxed JSON (comments, trailing commas, single quotes, unquoted keys) as strict JSON
 * with the smallest possible edits: layout, escapes and number spelling stay exactly as written.
 * Comments separated only by whitespace are removed as one block, and lines that only held
 * comments disappear completely.
 * @param {string} text
 * @returns {{ok: true, text: string, repairs: import('./parser.js').Repair[]}
 *   | {ok: false, error: import('./errors.js').JsonSyntaxError}} not ok when even relaxed parsing fails
 */
export function repair(text) {
  const result = tryParse(text, { relaxed: true });
  if (!result.ok) return result;
  const replacements = result.repairs.filter((item) => item.kind !== 'comment');
  const deletions = commentBlocks(text, result.repairs.filter((item) => item.kind === 'comment')).map((block) => commentEdit(text, block));
  return { ok: true, text: applyEdits(text, [...replacements, ...deletions]), repairs: result.repairs };
}

/** Joins comments (in source order) that only whitespace separates into blocks. */
function commentBlocks(text, comments) {
  const blocks = [];
  for (const { start, end } of comments) {
    const last = blocks.at(-1);
    if (last !== undefined && /^[ \t\r\n]*$/.test(text.slice(last.end, start))) last.end = end;
    else blocks.push({ start, end });
  }
  return blocks;
}

/** Widens a comment block's deletion over the blanks around it, or over its whole lines when they hold nothing else. */
function commentEdit(text, { start, end }) {
  let before = start;
  while (isBlank(text[before - 1])) before--;
  let after = end;
  while (isBlank(text[after])) after++;
  const opensLine = before === 0 || isBreak(text[before - 1]);
  const closesLine = after === text.length || isBreak(text[after]);
  if (opensLine && closesLine) return wholeLine(text, before, after);
  if (closesLine) return { start: before, end, text: '' };
  return { start, end: before < start ? after : end, text: '' };
}

/** Deletes [start, end) together with one adjacent line break (the next one, or else the previous one). */
function wholeLine(text, start, end) {
  if (end < text.length) return { start, end: end + (text.startsWith('\r\n', end) ? 2 : 1), text: '' };
  if (start === 0) return { start, end, text: '' };
  return { start: start - (text.startsWith('\r\n', start - 2) ? 2 : 1), end, text: '' };
}

/**
 * Applies edits that never overlap: replacements cover distinct tokens, and a comment block's
 * deletion covers only that block and whitespace next to it, which no other edit touches.
 */
function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let result = '';
  let cursor = 0;
  for (const edit of sorted) {
    result += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return result + text.slice(cursor);
}

function isBlank(char) {
  return char === ' ' || char === '\t';
}

function isBreak(char) {
  return char === '\n' || char === '\r';
}
