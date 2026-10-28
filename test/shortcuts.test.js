import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from '../src/parser.js';
import { shortcutAction, splitterKeyRatio, tabKeyIndex, treeKeyAction } from '../src/shortcuts.js';
import { buildTree, expandToDepth, flattenTree } from '../src/tree.js';
import { SPLIT } from '../src/view-utils.js';

describe('shortcutAction', () => {
  it('maps Ctrl or ⌘ with Enter, O and S to app actions', () => {
    assert.equal(shortcutAction({ key: 'Enter', ctrlKey: true }), 'format');
    assert.equal(shortcutAction({ key: 'Enter', metaKey: true }), 'format');
    assert.equal(shortcutAction({ key: 'Enter', ctrlKey: true, shiftKey: true }), 'minify');
    assert.equal(shortcutAction({ key: 'o', ctrlKey: true }), 'open');
    assert.equal(shortcutAction({ key: 'S', metaKey: true }), 'download');
  });

  it('ignores plain keys, Alt combinations and other shortcuts', () => {
    const ignored = [
      { key: 'Enter' },
      { key: 's' },
      { key: 'Enter', ctrlKey: true, altKey: true },
      { key: 's', ctrlKey: true, shiftKey: true },
      { key: 'o', ctrlKey: true, shiftKey: true },
      { key: 'c', ctrlKey: true },
      { key: 'Enter', shiftKey: true },
    ];
    for (const event of ignored) assert.equal(shortcutAction(event), null, JSON.stringify(event));
  });
});

describe('treeKeyAction', () => {
  // Rows: 0 $, 1 $.a, 2 $.a[0], 3 $.a[1], 4 $.a[1].b, 5 $.c, 6 $.d
  const root = buildTree(parse('{"a": [1, {"b": true}], "c": {"e": 1}, "d": null}').ast);
  const open = new Set(['$', '$.a', '$.a[1]']);
  const rows = flattenTree(root, open);
  const paths = rows.map((row) => row.node.path);
  const act = (active, key, options) => treeKeyAction(rows, active, key, options);

  it('lists the rows the tests expect', () => {
    assert.deepStrictEqual(paths, ['$', '$.a', '$.a[0]', '$.a[1]', '$.a[1].b', '$.c', '$.d']);
  });

  it('moves with the arrows, Home, End and the page keys, staying inside the list', () => {
    assert.deepStrictEqual(act(2, 'ArrowDown'), { type: 'move', index: 3 });
    assert.deepStrictEqual(act(2, 'ArrowUp'), { type: 'move', index: 1 });
    assert.deepStrictEqual(act(6, 'ArrowDown'), { type: 'move', index: 6 });
    assert.deepStrictEqual(act(0, 'ArrowUp'), { type: 'move', index: 0 });
    assert.deepStrictEqual(act(3, 'Home'), { type: 'move', index: 0 });
    assert.deepStrictEqual(act(3, 'End'), { type: 'move', index: 6 });
    assert.deepStrictEqual(act(1, 'PageDown', { page: 4 }), { type: 'move', index: 5 });
    assert.deepStrictEqual(act(5, 'PageDown', { page: 4 }), { type: 'move', index: 6 });
    assert.deepStrictEqual(act(5, 'PageUp', { page: 4 }), { type: 'move', index: 1 });
    assert.deepStrictEqual(act(1, 'PageUp'), { type: 'move', index: 0 });
  });

  it('opens closed containers with Right and steps into open ones', () => {
    assert.deepStrictEqual(act(5, 'ArrowRight'), { type: 'toggle', path: '$.c' });
    assert.deepStrictEqual(act(1, 'ArrowRight'), { type: 'move', index: 2 });
    assert.equal(act(2, 'ArrowRight'), null);
  });

  it('closes open containers with Left and otherwise steps out to the parent', () => {
    assert.deepStrictEqual(act(3, 'ArrowLeft'), { type: 'toggle', path: '$.a[1]' });
    assert.deepStrictEqual(act(4, 'ArrowLeft'), { type: 'move', index: 3 });
    assert.deepStrictEqual(act(2, 'ArrowLeft'), { type: 'move', index: 1 });
    assert.deepStrictEqual(act(5, 'ArrowLeft'), { type: 'move', index: 0 });
    assert.deepStrictEqual(act(0, 'ArrowLeft'), { type: 'toggle', path: '$' });
    const closed = flattenTree(root, new Set());
    assert.deepStrictEqual(treeKeyAction(closed, 0, 'ArrowLeft'), { type: 'move', index: 0 });
  });

  it('copies the path with Enter and Space', () => {
    assert.deepStrictEqual(act(4, 'Enter'), { type: 'copy', path: '$.a[1].b' });
    assert.deepStrictEqual(act(0, ' '), { type: 'copy', path: '$' });
  });

  it('clamps the active index and ignores other keys and empty lists', () => {
    assert.deepStrictEqual(act(-1, 'Enter'), { type: 'copy', path: '$' });
    assert.deepStrictEqual(act(99, 'ArrowUp'), { type: 'move', index: 5 });
    assert.equal(act(0, 'a'), null);
    assert.equal(act(0, 'Tab'), null);
    assert.equal(treeKeyAction([], 0, 'ArrowDown'), null);
  });

  it('never opens or closes anything in a flat list', () => {
    const flat = flattenTree(root, expandToDepth(root, Infinity)).map((row) => ({ ...row, expanded: false }));
    assert.equal(treeKeyAction(flat, 1, 'ArrowRight', { flat: true }), null);
    assert.equal(treeKeyAction(flat, 1, 'ArrowLeft', { flat: true }), null);
    assert.deepStrictEqual(treeKeyAction(flat, 1, 'ArrowDown', { flat: true }), { type: 'move', index: 2 });
    assert.deepStrictEqual(treeKeyAction(flat, 1, 'Enter', { flat: true }), { type: 'copy', path: '$.a' });
  });
});

describe('tabKeyIndex', () => {
  it('wraps around with the arrows and jumps with Home and End', () => {
    assert.equal(tabKeyIndex('ArrowRight', 0, 3), 1);
    assert.equal(tabKeyIndex('ArrowRight', 2, 3), 0);
    assert.equal(tabKeyIndex('ArrowLeft', 0, 3), 2);
    assert.equal(tabKeyIndex('ArrowLeft', 2, 3), 1);
    assert.equal(tabKeyIndex('Home', 2, 3), 0);
    assert.equal(tabKeyIndex('End', 0, 3), 2);
    assert.equal(tabKeyIndex('Enter', 1, 3), null);
    assert.equal(tabKeyIndex('ArrowDown', 1, 3), null);
  });
});

describe('splitterKeyRatio', () => {
  it('moves by one step and stops at the limits', () => {
    assert.equal(splitterKeyRatio('ArrowRight', 0.5), 0.5 + SPLIT.step);
    assert.equal(splitterKeyRatio('ArrowUp', 0.5), 0.5 + SPLIT.step);
    assert.equal(splitterKeyRatio('ArrowLeft', 0.5), 0.5 - SPLIT.step);
    assert.equal(splitterKeyRatio('ArrowDown', 0.5), 0.5 - SPLIT.step);
    assert.equal(splitterKeyRatio('ArrowLeft', SPLIT.min), SPLIT.min);
    assert.equal(splitterKeyRatio('ArrowRight', SPLIT.max - SPLIT.step / 2), SPLIT.max);
    assert.equal(splitterKeyRatio('Home', 0.5), SPLIT.min);
    assert.equal(splitterKeyRatio('End', 0.5), SPLIT.max);
    assert.equal(splitterKeyRatio('a', 0.5), null);
  });
});
