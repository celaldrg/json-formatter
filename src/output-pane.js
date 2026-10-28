import { renderCode } from './code-view.js';
import { renderDiff } from './diff-view.js';
import { byId } from './dom.js';
import { createEditor } from './editor-view.js';
import { errorLocation, errorMessage, t } from './i18n.js';
import { tabKeyIndex } from './shortcuts.js';
import { createTreeView } from './tree-view.js';
import { errorRange, matchRows } from './view-utils.js';
import { TABS } from './workspace.js';

/**
 * The output side with its tabs: Formatted (highlighted code), Tree (collapsible, with a query
 * box) and Diff (a second document compared with the input). Each change goes straight to the
 * workspace, then `onChange` asks the app to render again; only the selected tab is drawn.
 * @param {import('./workspace.js').Workspace} workspace
 * @param {{onChange: () => void, onCopyPath: (path: string) => void}} handlers
 */
export function createOutputPane(workspace, { onChange, onCopyPath }) {
  const tabs = TABS.map((name) => byId(`tab-${name}`));
  const panels = TABS.map((name) => byId(`panel-${name}`));
  const view = {
    code: byId('code'),
    codeView: byId('code-view'),
    empty: byId('empty-state'),
    stale: byId('stale-notice'),
    badge: byId('diff-badge'),
    query: byId('query-input'),
    queryStatus: byId('query-status'),
    expand: byId('expand-btn'),
    collapse: byId('collapse-btn'),
    pathbar: byId('pathbar'),
    diff: byId('diff-result'),
  };
  let lang = 'en';
  let shownOutput;
  let activePath = null;

  const tree = createTreeView(byId('tree'), {
    onToggle: (path) => change(() => workspace.toggle(path)),
    onCopy: onCopyPath,
    onActivate: (path) => {
      activePath = path;
      renderPath();
    },
  });
  const compare = createEditor(byId('compare-editor'), { onInput: (text) => change(() => workspace.update({ compare: text })) });

  tabs.forEach((tab, index) => tab.addEventListener('click', () => selectTab(index)));
  byId('tablist').addEventListener('keydown', (event) => {
    const index = tabKeyIndex(event.key, TABS.indexOf(workspace.getState().tab), TABS.length);
    if (index === null) return;
    event.preventDefault();
    selectTab(index);
    tabs[index].focus();
  });
  view.query.addEventListener('input', () => change(() => workspace.update({ query: view.query.value })));
  view.expand.addEventListener('click', () => change(workspace.expandAll));
  view.collapse.addEventListener('click', () => change(workspace.collapseAll));

  function change(apply) {
    apply();
    onChange();
  }

  function selectTab(index) {
    change(() => workspace.update({ tab: TABS[index] }));
  }

  /**
   * Draws the tabs and the selected panel.
   * @param {string} language
   */
  function render(language) {
    lang = language;
    const state = workspace.getState();
    const diff = workspace.diff();
    renderTabs(state, diff);
    if (state.tab === 'formatted') renderFormatted(state);
    else if (state.tab === 'tree') renderTree(state);
    else renderDiffPanel(state, diff);
  }

  function renderTabs(state, diff) {
    const empty = !state.hasDocument && state.tab !== 'diff';
    tabs.forEach((tab, index) => {
      const selected = TABS[index] === state.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected || empty;
    });
    view.empty.hidden = !empty;
    view.stale.hidden = !state.stale;
    const changes = diff.status === 'ok' ? diff.changes.length : 0;
    view.badge.hidden = changes === 0;
    view.badge.textContent = String(changes);
  }

  function renderFormatted(state) {
    view.codeView.classList.toggle('is-wrapped', state.mode === 'minify');
    const output = workspace.output();
    if (output === shownOutput) return;
    shownOutput = output;
    renderCode(view.code, output);
  }

  function renderTree(state) {
    const result = workspace.queryResult();
    const flat = result?.ok === true;
    tree.show(flat ? matchRows(result.matches) : workspace.rows(), { flat, lang });
    view.queryStatus.textContent = queryStatus(result, lang);
    view.queryStatus.dataset.tone = result?.ok === false ? 'error' : '';
    view.expand.disabled = flat || !state.hasDocument;
    view.collapse.disabled = flat || !state.hasDocument;
    renderPath();
  }

  function renderPath() {
    view.pathbar.textContent = activePath ?? t(lang, 'tree.hint');
    view.pathbar.classList.toggle('has-path', activePath !== null);
  }

  function renderDiffPanel(state, diff) {
    renderDiff(view.diff, diff, lang);
    compare.setError(diff.status === 'invalid' ? errorRange(state.compare, diff.error, state.relaxed) : null);
  }

  /**
   * Puts the second document and the query of the workspace into their fields (at start-up and
   * after Clear).
   * @param {{compare: string, query: string}} state
   */
  function fillFields({ compare: text, query }) {
    compare.setValue(text);
    view.query.value = query;
  }

  /** Scrolls the views back to the top and forgets the active row, for a newly loaded document. */
  function newDocument() {
    tree.reset();
    view.codeView.scrollTo(0, 0);
  }

  return { render, fillFields, newDocument, selectPath: tree.select };
}

function queryStatus(result, lang) {
  if (result === null) return '';
  if (!result.ok) return `${errorMessage(result.error, lang)} · ${errorLocation(result.error, lang)}`;
  return result.matches.length === 0 ? t(lang, 'query.none') : t(lang, 'query.matches', { count: result.matches.length });
}
