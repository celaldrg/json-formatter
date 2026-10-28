import { create } from './dom.js';

/** Above this many segments the output is shown as plain text, which keeps huge documents fast. */
const MAX_HIGHLIGHTED_SEGMENTS = 60000;

/** Segment kinds that stay plain text; the others get a coloured span. */
const PLAIN_KINDS = new Set(['punctuation', 'whitespace']);

/**
 * Shows formatted JSON with syntax highlighting: keys, strings, numbers, booleans and null each
 * get a span with their own colour, punctuation and whitespace stay plain text. Everything goes
 * in as text nodes, never as HTML.
 * @param {HTMLElement} target the <code> element
 * @param {{text: string, segments: import('./formatter.js').Segment[]}|null} output null clears it
 */
export function renderCode(target, output) {
  if (output === null) {
    target.replaceChildren();
    return;
  }
  if (output.segments.length > MAX_HIGHLIGHTED_SEGMENTS) {
    target.textContent = output.text;
    return;
  }
  const fragment = document.createDocumentFragment();
  let plain = '';
  for (const { kind, text } of output.segments) {
    if (PLAIN_KINDS.has(kind)) {
      plain += text;
      continue;
    }
    if (plain) fragment.append(plain);
    plain = '';
    fragment.append(create('span', `tok-${kind}`, text));
  }
  if (plain) fragment.append(plain);
  target.replaceChildren(fragment);
}
