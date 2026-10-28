import { splitterKeyRatio } from './shortcuts.js';
import { clampSplit, SPLIT } from './view-utils.js';

/**
 * The handle between the panes on wide screens. Drag it with a mouse, pen or finger (pointer
 * events), use the arrow keys, Home and End, or double-click it to go back to the initial split.
 * The ratio goes to the --split custom property of the container.
 * @param {HTMLElement} handle a focusable role="separator"
 * @param {HTMLElement} container the two-column grid
 * @param {{initial: number, onChange: (ratio: number) => void}} options onChange runs when a drag or key press ends
 */
export function createSplitter(handle, container, { initial, onChange }) {
  let ratio = initial;
  let dragging = false;

  handle.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const box = container.getBoundingClientRect();
    apply((event.clientX - box.left) / box.width);
  });
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  handle.addEventListener('keydown', (event) => {
    const next = splitterKeyRatio(event.key, ratio);
    if (next === null) return;
    event.preventDefault();
    apply(next);
    onChange(ratio);
  });
  handle.addEventListener('dblclick', () => {
    apply(SPLIT.initial);
    onChange(ratio);
  });

  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    onChange(ratio);
  }

  function apply(value) {
    ratio = clampSplit(value);
    container.style.setProperty('--split', String(ratio));
    handle.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  apply(initial);
}
