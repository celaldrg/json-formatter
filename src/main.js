import { byId, translatePage } from './dom.js';
import { copyText, downloadText, readTextFile, watchFileDrops } from './file-io.js';
import { errorLocation, errorMessage, LANGUAGES, otherLanguage, t } from './i18n.js';
import { createInputPane } from './input-pane.js';
import { createOutputPane } from './output-pane.js';
import { shortcutAction } from './shortcuts.js';
import { createSplitter } from './splitter.js';
import { storage } from './storage.js';
import { createToast } from './toast-view.js';
import { createToolbar } from './toolbar.js';
import { downloadName, parseSplit, pickLanguage, PREFERENCE_KEYS, readPreferences } from './view-utils.js';
import { createDemoWorkspace, createWorkspace } from './workspace.js';

/** Inputs longer than this are parsed a moment after typing pauses instead of on every key. */
const LARGE_INPUT = 200000;
const LARGE_INPUT_DELAY_MS = 250;
/** The tree row selected in the ?demo state: the 20-digit id that is kept exactly. */
const DEMO_PATH = '$.id';

// ?demo shows a fixed state for the README screenshot and leaves the stored settings alone.
const demo = new URLSearchParams(location.search).has('demo');
const workspace = demo ? createDemoWorkspace() : createWorkspace(readPreferences((key) => storage.get(key)));
let lang = demo ? LANGUAGES[0] : pickLanguage(storage.get('lang'));
let fileName = null;
let inputTimer = 0;

const fileInput = byId('file-input');
const toast = createToast(byId('toast'));
const inputPane = createInputPane({ onInput: scheduleInput, onRepair: repairInput });
const outputPane = createOutputPane(workspace, {
  onChange: render,
  onCopyPath: (path) => copy(path, translated('tree.copied', { path })),
});
const toolbar = createToolbar({
  format: () => changeSettings({ mode: 'pretty', tab: 'formatted' }),
  minify: () => changeSettings({ mode: 'minify', tab: 'formatted' }),
  sortKeys: () => changeSettings({ sortKeys: !workspace.getState().sortKeys }),
  indent: (indent) => changeSettings({ indent, mode: 'pretty' }),
  relaxed: () => changeSettings({ relaxed: !workspace.getState().relaxed }),
  repair: repairInput,
  open: () => fileInput.click(),
  sample: loadSample,
  copy: () => copy(workspace.output()?.text ?? '', translated('copy.done')),
  download: downloadOutput,
  clear: clearAll,
  language: () => setLanguage(otherLanguage(lang)),
});

fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;
  fileInput.value = '';
  if (file !== undefined) openFile(file);
});
watchFileDrops(byId('drop-overlay'), openFile);
createSplitter(byId('splitter'), byId('workspace'), {
  initial: parseSplit(demo ? null : storage.get('split')),
  onChange: (ratio) => remember('split', String(ratio)),
});
document.addEventListener('keydown', handleShortcut);

inputPane.setText(workspace.getState().input);
outputPane.fillFields(workspace.getState());
setLanguage(lang);
if (demo) outputPane.selectPath(DEMO_PATH);

function render() {
  const state = workspace.getState();
  toolbar.render(state);
  inputPane.render(state, lang);
  outputPane.render(lang);
}

function scheduleInput(text) {
  clearTimeout(inputTimer);
  if (text.length > LARGE_INPUT) inputTimer = setTimeout(() => applyInput(text), LARGE_INPUT_DELAY_MS);
  else applyInput(text);
}

function applyInput(text) {
  workspace.update({ input: text });
  render();
}

function changeSettings(patch) {
  workspace.update(patch);
  const state = workspace.getState();
  for (const key of PREFERENCE_KEYS) remember(key, String(state[key]));
  render();
}

function remember(key, value) {
  if (!demo) storage.set(key, value);
}

function setLanguage(next) {
  lang = next;
  remember('lang', lang);
  document.documentElement.lang = lang;
  document.title = t(lang, 'app.title');
  translatePage(document, lang);
  render();
  toast.translate();
}

/** Replaces the input with a new document, e.g. an opened file or a sample. */
function loadText(text, name) {
  clearTimeout(inputTimer);
  workspace.load(text);
  fileName = name;
  inputPane.setText(workspace.getState().input);
  outputPane.newDocument();
  render();
}

function loadSample() {
  workspace.loadSample();
  loadText(workspace.getState().input, null);
}

async function openFile(file) {
  try {
    loadText(await readTextFile(file), file.name);
    toast.show(translated('file.opened', { name: file.name }));
  } catch {
    toast.show(translated('file.failed'), 'error');
  }
}

function repairInput() {
  const result = workspace.repair();
  if (!result.ok) {
    toast.show(() => `${errorMessage(result.error, lang)} · ${errorLocation(result.error, lang)}`, 'error');
    return;
  }
  if (result.count > 0) inputPane.setText(workspace.getState().input, { keepScroll: true });
  toast.show(translated(result.count > 0 ? 'repair.done' : 'repair.nothing', { count: result.count }));
  render();
}

function clearAll() {
  workspace.update({ compare: '', query: '' });
  outputPane.fillFields(workspace.getState());
  loadText('', null);
  inputPane.focus();
}

function downloadOutput() {
  const output = workspace.output();
  if (output !== null) downloadText(output.text, downloadName(fileName, workspace.getState().mode));
}

async function copy(text, message) {
  if (await copyText(text)) toast.show(message);
  else toast.show(translated('copy.failed'), 'error');
}

/** A toast message that reads its string in the current language, so it follows a language switch. */
function translated(key, params) {
  return () => t(lang, key, params);
}

function handleShortcut(event) {
  const action = shortcutAction(event);
  if (action === null) return;
  event.preventDefault();
  if (action === 'open') fileInput.click();
  else if (action === 'download') downloadOutput();
  else changeSettings({ mode: action === 'minify' ? 'minify' : 'pretty', tab: 'formatted' });
}
