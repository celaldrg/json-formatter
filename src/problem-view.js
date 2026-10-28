import { create, icon } from './dom.js';
import { errorLocation, errorMessage, t } from './i18n.js';

/** Relaxed fixes listed with their positions at most; the rest are counted. */
const MAX_LISTED_FIXES = 3;

/**
 * @typedef {{offset: number, line: number, column: number}} Position
 */

/**
 * The panel under the input. For a syntax error it says what is wrong, gives the line and column
 * as a button that puts the caret there and, when Relaxed mode would accept the input, a hint to
 * turn it on. In Relaxed mode it lists what Repair will change, with the positions, and a Repair
 * button.
 * @param {HTMLElement} element
 * @param {{onGoto: (position: Position) => void, onRepair: () => void}} handlers
 */
export function createProblemView(element, { onGoto, onRepair }) {
  /** @type {Position[]} where the position buttons point, by their data-goto index */
  let targets = [];

  element.addEventListener('click', (event) => {
    const goto = event.target.closest('[data-goto]');
    if (goto !== null) onGoto(targets[Number(goto.dataset.goto)]);
    else if (event.target.closest('.problem-repair') !== null) onRepair();
  });

  /**
   * @param {import('./workspace.js').WorkspaceState} state
   * @param {string} lang
   */
  function show(state, lang) {
    targets = [];
    element.hidden = state.error === null && state.repairs.length === 0;
    if (state.error !== null) showError(state.error, lang);
    else if (state.repairs.length > 0) showFixes(state.repairs, lang);
    else element.replaceChildren();
  }

  function showError(error, lang) {
    element.dataset.tone = 'error';
    const body = create('div', 'problem-body');
    body.append(create('p', 'problem-message', errorMessage(error, lang)));
    if (error.hint === 'relaxed') body.append(create('p', 'problem-hint', t(lang, 'error.hint.relaxed')));
    element.replaceChildren(icon('alert', 'icon problem-icon'), body, gotoButton(error, lang));
  }

  function showFixes(repairs, lang) {
    element.dataset.tone = 'info';
    const list = create('ul', 'problem-fixes');
    for (const fix of repairs.slice(0, MAX_LISTED_FIXES)) {
      const item = create('li');
      item.append(gotoButton({ offset: fix.start, line: fix.line, column: fix.column }, lang), create('span', '', t(lang, `repair.${fix.kind}`)));
      list.append(item);
    }
    if (repairs.length > MAX_LISTED_FIXES) list.append(create('li', 'problem-more', t(lang, 'list.more', { count: repairs.length - MAX_LISTED_FIXES })));
    const body = create('div', 'problem-body');
    body.append(create('p', 'problem-message', t(lang, 'status.repairs', { count: repairs.length })), list);
    const repair = create('button', 'btn btn-small problem-repair', t(lang, 'action.repair'));
    repair.type = 'button';
    element.replaceChildren(icon('repair', 'icon problem-icon'), body, repair);
  }

  function gotoButton(position, lang) {
    const button = create('button', 'problem-goto', errorLocation(position, lang));
    button.type = 'button';
    button.title = t(lang, 'problem.goto');
    button.dataset.goto = String(targets.length);
    targets.push({ offset: position.offset, line: position.line, column: position.column });
    return button;
  }

  return { show };
}
