import { normalizeNewlines } from './view-utils.js';

/** How long a download link stays valid; the browser has started the download by then. */
const REVOKE_DELAY_MS = 30000;

/**
 * Reads a picked or dropped file as text with \n line breaks, the way the textarea holds it,
 * so error positions match the editor.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readTextFile(file) {
  return normalizeNewlines(await file.text());
}

/**
 * Saves text as a JSON file through a temporary download link.
 * @param {string} text
 * @param {string} name
 */
export function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Copies text to the clipboard. Where the Clipboard API is missing or refuses (pages served
 * over plain http on a LAN address), it copies through a selected, off-screen textarea.
 * @param {string} text
 * @returns {Promise<boolean>} whether the text was copied
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyThroughSelection(text);
  }
}

function copyThroughSelection(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.className = 'offscreen';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Opens a file dropped anywhere on the page and shows an overlay while one is dragged over it.
 * Text dragged into a textarea is left to the browser.
 * @param {HTMLElement} overlay
 * @param {(file: File) => void} onFile
 */
export function watchFileDrops(overlay, onFile) {
  let depth = 0;
  const carriesFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const hide = () => {
    depth = 0;
    overlay.hidden = true;
  };
  window.addEventListener('dragenter', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragover', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!carriesFiles(event)) return;
    depth--;
    if (depth <= 0) hide();
  });
  window.addEventListener('drop', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    hide();
    const [file] = event.dataTransfer.files;
    if (file !== undefined) onFile(file);
  });
}
