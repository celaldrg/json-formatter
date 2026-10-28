import { create } from './dom.js';
import { countLines, visibleRange } from './view-utils.js';

const OVERSCAN = 4;
/** Longer line prefixes are not laid out to measure them; they are estimated from one digit. */
const MEASURE_LIMIT = 4000;

/**
 * @typedef {ReturnType<typeof import('./view-utils.js').errorRange>} ErrorRange
 * @typedef {{offset: number, line: number, column: number}} Position
 */

/**
 * A code editor made of a plain textarea, a line-number gutter and an error marker: a band on
 * the error line, a red number in the gutter and a box under the offending token. The gutter
 * only holds the numbers in view, so long documents stay fast.
 * @param {HTMLElement} root holds a textarea, .gutter-lines, .mark-line, .mark-char, .measure and .editor-hint
 * @param {{onInput: (text: string) => void}} handlers
 */
export function createEditor(root, { onInput }) {
  const textarea = root.querySelector('textarea');
  const numbers = root.querySelector('.gutter-lines');
  const band = root.querySelector('.mark-line');
  const box = root.querySelector('.mark-char');
  const measure = root.querySelector('.measure');
  const hint = root.querySelector('.editor-hint');
  let lineCount = 1;
  /** @type {ErrorRange|null} */
  let range = null;
  /** @type {{x: number, width: number}|null} horizontal place of the box, measured lazily */
  let place = null;
  let metrics = null;

  textarea.addEventListener('input', () => {
    textChanged();
    onInput(textarea.value);
  });
  textarea.addEventListener('scroll', draw, { passive: true });
  new ResizeObserver(() => {
    metrics = null;
    place = null;
    draw();
  }).observe(textarea, { box: 'border-box' });

  function textChanged() {
    lineCount = countLines(textarea.value);
    root.style.setProperty('--digits', String(String(lineCount).length));
    hint.hidden = textarea.value !== '';
    draw();
  }

  function readMetrics() {
    const style = getComputedStyle(textarea);
    return { lineHeight: parseFloat(style.lineHeight), top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft) };
  }

  function draw() {
    metrics ??= readMetrics();
    drawGutter();
    drawMarker();
  }

  function drawGutter() {
    const { lineHeight, top } = metrics;
    const { first, last } = visibleRange({
      offset: textarea.scrollTop - top,
      viewport: textarea.clientHeight,
      itemSize: lineHeight,
      count: lineCount,
      overscan: OVERSCAN,
    });
    const items = [];
    for (let line = first + 1; line <= last; line++) {
      items.push(create('div', line === range?.line ? 'gutter-line is-error' : 'gutter-line', String(line)));
    }
    numbers.replaceChildren(...items);
    numbers.style.transform = `translateY(${top + first * lineHeight - textarea.scrollTop}px)`;
  }

  function drawMarker() {
    band.hidden = range === null;
    box.hidden = range === null;
    if (range === null) return;
    place ??= measurePlace(range);
    const y = metrics.top + (range.line - 1) * metrics.lineHeight - textarea.scrollTop;
    band.style.transform = `translateY(${y}px)`;
    box.style.transform = `translate(${metrics.left + place.x - textarea.scrollLeft}px, ${y}px)`;
    box.style.width = `${place.width}px`;
  }

  function measurePlace({ lineStart, start, end }) {
    const text = textarea.value;
    const width = end > start ? textWidth(text.slice(start, end)) : textWidth(' ');
    return { x: textWidth(text.slice(lineStart, start)), width: Math.max(width, 2) };
  }

  function textWidth(text) {
    if (text.length > MEASURE_LIMIT) return text.length * textWidth('0');
    measure.textContent = text;
    return measure.getBoundingClientRect().width;
  }

  /**
   * Replaces the whole text, e.g. with an opened file or the repaired input.
   * @param {string} text
   * @param {{keepScroll?: boolean}} [options] keepScroll keeps the scroll position (after a repair)
   */
  function setValue(text, { keepScroll = false } = {}) {
    const { scrollTop, scrollLeft } = textarea;
    textarea.value = text;
    textarea.scrollTop = keepScroll ? scrollTop : 0;
    textarea.scrollLeft = keepScroll ? scrollLeft : 0;
    textChanged();
  }

  /**
   * Marks an error, or removes the marker.
   * @param {ErrorRange|null} next from errorRange(), for the current text
   */
  function setError(next) {
    range = next;
    place = null;
    draw();
  }

  /**
   * Focuses the textarea with the caret at a position and scrolls that position into view.
   * @param {Position} position
   */
  function reveal({ offset, line, column }) {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(offset, offset);
    metrics ??= readMetrics();
    const y = metrics.top + (line - 1) * metrics.lineHeight;
    if (y < textarea.scrollTop || y + metrics.lineHeight > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, y - textarea.clientHeight / 3);
    }
    const x = metrics.left + textWidth(textarea.value.slice(offset - (column - 1), offset));
    if (x < textarea.scrollLeft + metrics.left || x > textarea.scrollLeft + textarea.clientWidth - metrics.left) {
      textarea.scrollLeft = Math.max(0, x - textarea.clientWidth / 2);
    }
    draw();
  }

  textChanged();
  return { setValue, setError, reveal };
}
