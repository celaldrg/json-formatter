import { byId } from './dom.js';
import { createEditor } from './editor-view.js';
import { t } from './i18n.js';
import { createProblemView } from './problem-view.js';
import { countLines, errorRange, formatBytes, utf8Length } from './view-utils.js';

/**
 * The input side: the editor with its line numbers and error marker, the status chip, the size
 * of the text and the panel with the error or the relaxed fixes.
 * @param {{onInput: (text: string) => void, onRepair: () => void}} handlers
 */
export function createInputPane({ onInput, onRepair }) {
  const editor = createEditor(byId('input-editor'), { onInput });
  const problem = createProblemView(byId('problem'), { onGoto: editor.reveal, onRepair });
  const status = byId('status');
  const statusText = byId('status-text');
  const stats = byId('stats');

  /**
   * @param {import('./workspace.js').WorkspaceState} state
   * @param {string} lang
   */
  function render(state, lang) {
    status.dataset.status = state.status;
    statusText.textContent = t(lang, `status.${state.status}`);
    stats.textContent = t(lang, 'input.stats', { lines: countLines(state.input), size: formatBytes(utf8Length(state.input), lang) });
    editor.setError(state.error === null ? null : errorRange(state.input, state.error, state.relaxed));
    problem.show(state, lang);
  }

  return { render, setText: editor.setValue, focus: () => byId('input').focus() };
}
