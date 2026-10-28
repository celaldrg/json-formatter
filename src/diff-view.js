import { create } from './dom.js';
import { preview } from './formatter.js';
import { errorLocation, errorMessage, t } from './i18n.js';

/** Changes listed one by one at most; the rest are counted in a last line. */
const MAX_LISTED_CHANGES = 300;
const VALUE_PREVIEW_LENGTH = 48;

/**
 * Shows the result of comparing the input with the second document: a message, or a summary
 * and the list of changes with their paths and values.
 * @param {HTMLElement} target
 * @param {ReturnType<import('./workspace.js').Workspace['diff']>} result
 * @param {string} lang
 */
export function renderDiff(target, result, lang) {
  target.replaceChildren(...diffContent(result, lang));
}

function diffContent(result, lang) {
  if (result.status === 'empty') return [note(t(lang, 'diff.empty'))];
  if (result.status === 'no-document') return [note(t(lang, 'diff.noDocument'))];
  if (result.status === 'invalid') {
    const details = `${errorMessage(result.error, lang)} · ${errorLocation(result.error, lang)}`;
    return [note(t(lang, 'diff.invalid'), 'is-error'), note(details, 'is-error is-detail')];
  }
  if (result.changes.length === 0) return [note(t(lang, 'diff.identical'), 'is-success')];
  return [create('p', 'diff-summary', t(lang, 'diff.summary', result.counts)), changeList(result.changes, lang)];
}

function note(text, tone = '') {
  return create('p', `diff-note ${tone}`.trim(), text);
}

function changeList(changes, lang) {
  const list = create('ul', 'change-list');
  for (const change of changes.slice(0, MAX_LISTED_CHANGES)) list.append(changeItem(change, lang));
  if (changes.length > MAX_LISTED_CHANGES) {
    list.append(create('li', 'change-more', t(lang, 'list.more', { count: changes.length - MAX_LISTED_CHANGES })));
  }
  return list;
}

function changeItem({ type, path, before, after }, lang) {
  const item = create('li', `change is-${type}`);
  const values = create('span', 'change-values');
  if (before !== null) values.append(create('span', 'change-before', preview(before, VALUE_PREVIEW_LENGTH)));
  if (before !== null && after !== null) values.append(arrow());
  if (after !== null) values.append(create('span', 'change-after', preview(after, VALUE_PREVIEW_LENGTH)));
  item.append(create('span', 'change-type', t(lang, `diff.${type}`)), create('code', 'change-path', path), values);
  return item;
}

function arrow() {
  const element = create('span', 'change-arrow', '→');
  element.setAttribute('aria-hidden', 'true');
  return element;
}
