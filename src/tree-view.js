import { create } from './dom.js';
import { t } from './i18n.js';
import { treeKeyAction } from './shortcuts.js';
import { visibleRange } from './view-utils.js';

const INDENT_STEP = 16;
const MAX_INDENT_LEVELS = 24;
const OVERSCAN = 8;
const FALLBACK_ROW_HEIGHT = 32;
const BRACKETS = Object.freeze({ object: ['{', '}'], array: ['[', ']'] });

/**
 * @typedef {{path: string, key: string|number|null, type: string, depth: number, count: number, preview: string, lossy: boolean}} RowNode
 * @typedef {{node: RowNode, expanded: boolean}} Row
 */

/**
 * A virtualised tree in the WAI-ARIA tree pattern: only the rows in view exist in the DOM, the
 * active row is announced with aria-activedescendant and the keys of treeKeyAction() work.
 * A tap on a row's triangle opens or closes it; a tap anywhere else on the row copies its path.
 * With `flat` the same view lists query matches, labelled by their paths.
 * @param {HTMLElement} scroller focusable role="tree" element that scrolls and holds a .tree-space
 * @param {{onToggle: (path: string) => void, onCopy: (path: string) => void, onActivate: (path: string|null) => void}} handlers
 */
export function createTreeView(scroller, { onToggle, onCopy, onActivate }) {
  const space = scroller.querySelector('.tree-space');
  /** @type {Row[]} */
  let rows = [];
  let flat = false;
  let lang = 'en';
  let active = -1;
  let activePath = null;
  let rowHeight = 0;
  let drawnRange = '';

  scroller.addEventListener('scroll', () => draw(false), { passive: true });
  scroller.addEventListener('click', handleClick);
  scroller.addEventListener('keydown', handleKey);
  scroller.addEventListener('focus', () => {
    if (active < 0 && rows.length > 0 && scroller.matches(':focus-visible')) activate(0, false);
  });
  new ResizeObserver(() => {
    rowHeight = 0;
    draw(true);
  }).observe(scroller, { box: 'border-box' });

  /**
   * Shows new rows, keeping the active row when its path is still listed.
   * @param {Row[]} nextRows
   * @param {{flat: boolean, lang: string}} options
   */
  function show(nextRows, options) {
    rows = nextRows;
    flat = options.flat;
    lang = options.lang;
    active = activePath === null ? -1 : rows.findIndex((row) => row.node.path === activePath);
    draw(true);
  }

  function draw(force) {
    rowHeight ||= parseFloat(getComputedStyle(scroller).getPropertyValue('--row-h')) || FALLBACK_ROW_HEIGHT;
    space.style.height = `${rows.length * rowHeight}px`;
    const { first, last } = visibleRange({
      offset: scroller.scrollTop,
      viewport: scroller.clientHeight,
      itemSize: rowHeight,
      count: rows.length,
      overscan: OVERSCAN,
    });
    if (!force && drawnRange === `${first}:${last}`) return;
    drawnRange = `${first}:${last}`;
    const elements = [];
    for (let index = first; index < last; index++) elements.push(buildRow(index));
    space.replaceChildren(...elements);
    markActive();
  }

  function buildRow(index) {
    const { node, expanded } = rows[index];
    const row = create('div', 'tree-row');
    row.id = rowId(index);
    row.dataset.index = String(index);
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(node.depth + 1));
    row.style.transform = `translateY(${index * rowHeight}px)`;
    const expandable = !flat && node.count > 0;
    if (expandable) row.setAttribute('aria-expanded', String(expanded));
    if (!flat) {
      const indent = create('span', 'tree-indent');
      indent.style.width = `${Math.min(node.depth, MAX_INDENT_LEVELS) * INDENT_STEP}px`;
      const toggleClass = expandable ? `tree-toggle${expanded ? ' is-open' : ''}` : 'tree-toggle is-leaf';
      row.append(indent, create('span', toggleClass));
    }
    row.append(label(node));
    if (node.type === 'object' || node.type === 'array') {
      const [open, close] = BRACKETS[node.type];
      row.append(create('span', 'tree-count', node.count === 0 ? open + close : `${open}${node.count}${close}`));
    } else {
      row.append(create('span', 'tree-colon', ':'), create('span', `tree-value v-${node.type}`, node.preview));
    }
    if (node.lossy) {
      const badge = create('span', 'tree-badge', t(lang, 'tree.exact'));
      badge.title = t(lang, 'tree.lossy');
      row.append(badge);
    }
    row.append(create('span', 'tree-type', t(lang, `type.${node.type}`)));
    return row;
  }

  function label(node) {
    if (flat) return create('span', 'tree-key tree-path', node.path);
    if (node.key === null) return create('span', 'tree-key tree-root', node.path);
    if (typeof node.key === 'number') return create('span', 'tree-key tree-index', String(node.key));
    return create('span', 'tree-key', node.key === '' ? '""' : node.key);
  }

  function handleClick(event) {
    const row = event.target.closest('.tree-row');
    if (row === null) return;
    const index = Number(row.dataset.index);
    const { node } = rows[index];
    activate(index, false);
    if (event.target.closest('.tree-toggle') && !flat && node.count > 0) onToggle(node.path);
    else onCopy(node.path);
  }

  function handleKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const page = Math.max(1, Math.floor(scroller.clientHeight / rowHeight) - 1);
    const action = treeKeyAction(rows, active, event.key, { page, flat });
    if (action === null) return;
    event.preventDefault();
    if (action.type === 'move') activate(action.index, true);
    else if (action.type === 'toggle') onToggle(action.path);
    else onCopy(action.path);
  }

  function activate(index, reveal) {
    active = index;
    activePath = rows[index]?.node.path ?? null;
    if (reveal) scrollToRow(index);
    markActive();
    onActivate(activePath);
  }

  function scrollToRow(index) {
    const top = index * rowHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + rowHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + rowHeight - scroller.clientHeight;
  }

  /** Marks the active row among the drawn ones and points aria-activedescendant at it. */
  function markActive() {
    for (const element of space.querySelectorAll('.is-active')) {
      element.classList.remove('is-active');
      element.setAttribute('aria-selected', 'false');
    }
    const element = active < 0 ? null : document.getElementById(rowId(active));
    if (element === null) {
      scroller.removeAttribute('aria-activedescendant');
      return;
    }
    element.classList.add('is-active');
    element.setAttribute('aria-selected', 'true');
    scroller.setAttribute('aria-activedescendant', element.id);
  }

  function rowId(index) {
    return `${scroller.id}-row-${index}`;
  }

  /**
   * Makes the row with this path the active one (if it is listed) and scrolls to it.
   * @param {string} path
   */
  function select(path) {
    const index = rows.findIndex((row) => row.node.path === path);
    if (index >= 0) activate(index, true);
  }

  /** Scrolls back to the top and forgets the active row, for a newly loaded document. */
  function reset() {
    active = -1;
    activePath = null;
    scroller.scrollTop = 0;
    onActivate(null);
  }

  return { show, select, reset };
}
