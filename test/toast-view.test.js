import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { t } from '../src/i18n.js';
import { createToast, VISIBLE_MS } from '../src/toast-view.js';

/** The parts of a DOM element the toast uses. */
function fakeElement() {
  const classes = new Set();
  return {
    textContent: '',
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
}

const isVisible = (element) => element.classList.contains('is-visible');

describe('createToast', () => {
  it('shows a message with its tone and hides it after a moment', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const element = fakeElement();
    const toast = createToast(element);
    toast.show(() => 'Could not copy', 'error');
    assert.deepStrictEqual([element.textContent, element.dataset.tone, isVisible(element)], ['Could not copy', 'error', true]);
    context.mock.timers.tick(VISIBLE_MS - 1);
    assert.equal(isVisible(element), true);
    context.mock.timers.tick(1);
    assert.equal(isVisible(element), false);
    toast.show(() => 'Copied');
    assert.deepStrictEqual([element.textContent, element.dataset.tone, isVisible(element)], ['Copied', 'info', true]);
  });

  it('keeps a new message on screen for the full time', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const element = fakeElement();
    const toast = createToast(element);
    toast.show(() => 'first');
    context.mock.timers.tick(VISIBLE_MS - 400);
    toast.show(() => 'second');
    context.mock.timers.tick(VISIBLE_MS - 1);
    assert.deepStrictEqual([element.textContent, isVisible(element)], ['second', true]);
    context.mock.timers.tick(1);
    assert.equal(isVisible(element), false);
  });

  it('writes the message on screen again in the language just chosen', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let lang = 'en';
    const element = fakeElement();
    const toast = createToast(element);
    toast.translate();
    assert.equal(element.textContent, '');
    toast.show(() => t(lang, 'tree.copied', { path: '$.id' }));
    assert.equal(element.textContent, 'Copied $.id');
    lang = 'tr';
    toast.translate();
    assert.deepStrictEqual([element.textContent, isVisible(element)], ['$.id kopyalandı', true]);
  });

  it('leaves a hidden message alone, so the live region does not announce it again', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const element = fakeElement();
    const toast = createToast(element);
    toast.show(() => `message ${++calls}`);
    context.mock.timers.tick(VISIBLE_MS);
    toast.translate();
    assert.deepStrictEqual([element.textContent, calls], ['message 1', 1]);
  });
});
