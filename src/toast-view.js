/** How long a message stays on screen. */
export const VISIBLE_MS = 2400;

/**
 * A short message near the bottom of the screen; the element is a live region, so screen
 * readers announce it too. A message is a function that returns its text in the current
 * language, so a message still on screen can be written again when the language changes.
 * @param {HTMLElement} element role="status"
 * @returns {{show: (message: () => string, tone?: 'info'|'error') => void, translate: () => void}}
 */
export function createToast(element) {
  let timer = 0;
  let onScreen = null;

  function show(message, tone = 'info') {
    onScreen = message;
    element.textContent = message();
    element.dataset.tone = tone;
    element.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(hide, VISIBLE_MS);
  }

  function hide() {
    onScreen = null;
    element.classList.remove('is-visible');
  }

  /** Writes the message on screen again, e.g. in the language just chosen. */
  function translate() {
    if (onScreen !== null) element.textContent = onScreen();
  }

  return { show, translate };
}
