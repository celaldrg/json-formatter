import { byId } from './dom.js';

/** Button ids and the action each one runs. */
const BUTTON_ACTIONS = Object.freeze([
  ['format-btn', 'format'],
  ['minify-btn', 'minify'],
  ['sort-btn', 'sortKeys'],
  ['relaxed-toggle', 'relaxed'],
  ['repair-btn', 'repair'],
  ['open-btn', 'open'],
  ['sample-btn', 'sample'],
  ['empty-sample-btn', 'sample'],
  ['copy-btn', 'copy'],
  ['download-btn', 'download'],
  ['clear-btn', 'clear'],
  ['lang-btn', 'language'],
]);

/**
 * @typedef {Object} ToolbarActions
 * @property {() => void} format
 * @property {() => void} minify
 * @property {() => void} sortKeys
 * @property {(indent: 2|4|'tab') => void} indent
 * @property {() => void} relaxed
 * @property {() => void} repair
 * @property {() => void} open
 * @property {() => void} sample
 * @property {() => void} copy
 * @property {() => void} download
 * @property {() => void} clear
 * @property {() => void} language
 */

/**
 * Wires the toolbar and the header buttons to the app's actions, and shows the current settings
 * on them: the pressed output mode, Sort keys and Relaxed mode, the indent, what is available.
 * @param {ToolbarActions} actions
 */
export function createToolbar(actions) {
  for (const [id, action] of BUTTON_ACTIONS) byId(id).addEventListener('click', () => actions[action]());
  const indent = byId('indent-select');
  indent.addEventListener('change', () => actions.indent(indent.value === 'tab' ? 'tab' : Number(indent.value)));
  const buttons = {
    format: byId('format-btn'),
    minify: byId('minify-btn'),
    sort: byId('sort-btn'),
    relaxed: byId('relaxed-toggle'),
    repair: byId('repair-btn'),
    repairCount: byId('repair-count'),
    copy: byId('copy-btn'),
    download: byId('download-btn'),
    clear: byId('clear-btn'),
  };

  /** @param {import('./workspace.js').WorkspaceState} state */
  function render(state) {
    buttons.format.setAttribute('aria-pressed', String(state.mode === 'pretty'));
    buttons.minify.setAttribute('aria-pressed', String(state.mode === 'minify'));
    buttons.sort.setAttribute('aria-pressed', String(state.sortKeys));
    buttons.relaxed.setAttribute('aria-checked', String(state.relaxed));
    indent.value = String(state.indent);
    buttons.repair.disabled = state.status === 'empty';
    buttons.repairCount.hidden = state.repairs.length === 0;
    buttons.repairCount.textContent = String(state.repairs.length);
    buttons.copy.disabled = !state.hasDocument;
    buttons.download.disabled = !state.hasDocument;
    buttons.clear.disabled = state.input === '' && state.compare === '' && state.query === '';
  }

  return { render };
}
