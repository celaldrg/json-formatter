import { clampSplit, SPLIT } from './view-utils.js';

/**
 * Keyboard handling as pure functions of event-like objects: the app-wide shortcuts, the keys of
 * the tree view (the WAI-ARIA tree pattern), the tab list and the pane splitter. The views only
 * carry out the result.
 */

/**
 * @typedef {{key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean}} KeyPress
 * @typedef {{node: {path: string, depth: number, count: number}, expanded: boolean}} Row
 * @typedef {{type: 'move', index: number} | {type: 'toggle', path: string} | {type: 'copy', path: string}} TreeAction
 */

/**
 * The app action for a key press: Ctrl/⌘+Enter formats, Ctrl/⌘+Shift+Enter minifies,
 * Ctrl/⌘+O opens a file and Ctrl/⌘+S downloads the output.
 * @param {KeyPress} event
 * @returns {'format'|'minify'|'open'|'download'|null}
 */
export function shortcutAction({ key, ctrlKey = false, metaKey = false, shiftKey = false, altKey = false }) {
  if (!(ctrlKey || metaKey) || altKey) return null;
  const name = key.toLowerCase();
  if (name === 'enter') return shiftKey ? 'minify' : 'format';
  if (shiftKey) return null;
  if (name === 'o') return 'open';
  if (name === 's') return 'download';
  return null;
}

/**
 * What a key does in the tree view: arrows, Home, End and Page keys move; Right opens a closed
 * container or steps into an open one; Left closes an open container or steps out to the
 * parent; Enter and Space copy the path. In a flat list (query matches) nothing opens or closes.
 * @param {Row[]} rows the visible rows
 * @param {number} active index of the active row (clamped into range)
 * @param {string} key KeyboardEvent.key
 * @param {{page?: number, flat?: boolean}} [options] page: rows moved by PageUp and PageDown
 * @returns {TreeAction|null} null when the key does nothing here
 */
export function treeKeyAction(rows, active, key, { page = 10, flat = false } = {}) {
  if (rows.length === 0) return null;
  const current = clampIndex(active, rows.length);
  const row = rows[current];
  const move = (index) => ({ type: 'move', index: clampIndex(index, rows.length) });
  const toggle = () => ({ type: 'toggle', path: row.node.path });
  const expandable = !flat && row.node.count > 0;
  switch (key) {
    case 'ArrowDown':
      return move(current + 1);
    case 'ArrowUp':
      return move(current - 1);
    case 'Home':
      return move(0);
    case 'End':
      return move(rows.length - 1);
    case 'PageDown':
      return move(current + page);
    case 'PageUp':
      return move(current - page);
    case 'ArrowRight':
      if (!expandable) return null;
      return row.expanded ? move(current + 1) : toggle();
    case 'ArrowLeft':
      if (expandable && row.expanded) return toggle();
      return flat ? null : move(parentIndex(rows, current));
    case 'Enter':
    case ' ':
      return { type: 'copy', path: row.node.path };
    default:
      return null;
  }
}

/**
 * The tab a key moves to in a tab list (the WAI-ARIA tabs pattern): Left and Right wrap around,
 * Home and End go to the first and the last tab.
 * @param {string} key KeyboardEvent.key
 * @param {number} index the selected tab
 * @param {number} count number of tabs
 * @returns {number|null} null when the key does nothing here
 */
export function tabKeyIndex(key, index, count) {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * The split ratio after a key press on the splitter: Left/Down and Right/Up move it by one step,
 * Home and End go to the limits.
 * @param {string} key KeyboardEvent.key
 * @param {number} ratio the current ratio
 * @returns {number|null} the new ratio within SPLIT.min and SPLIT.max, or null when the key does nothing here
 */
export function splitterKeyRatio(key, ratio) {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampSplit(ratio - SPLIT.step);
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampSplit(ratio + SPLIT.step);
  if (key === 'Home') return SPLIT.min;
  if (key === 'End') return SPLIT.max;
  return null;
}

/** Index of the closest row above `index` that is one level shallower; the row itself for the root. */
function parentIndex(rows, index) {
  const { depth } = rows[index].node;
  for (let candidate = index - 1; candidate >= 0; candidate--) {
    if (rows[candidate].node.depth < depth) return candidate;
  }
  return index;
}

function clampIndex(index, length) {
  return Math.min(Math.max(index, 0), length - 1);
}
