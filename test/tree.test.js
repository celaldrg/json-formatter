import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from '../src/parser.js';
import { query } from '../src/query.js';
import { buildTree, expandToDepth, flattenTree } from '../src/tree.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const TEXT = [
  '{',
  '  "name": "x",',
  '  "list": [1, {"deep": true}],',
  '  "empty": {},',
  '  "big": 12345678901234567890,',
  '  "odd key": null',
  '}',
].join('\n');

const summary = ({ path, key, type, depth, count, preview, lossy }) => [path, key, type, depth, count, preview, lossy];
const rowPaths = (rows) => rows.map((row) => row.node.path);

describe('buildTree', () => {
  const root = buildTree(parse(TEXT).ast);

  it('describes the root', () => {
    assert.deepStrictEqual(summary(root), ['$', null, 'object', 0, 5, '', false]);
    assert.deepStrictEqual([root.start, root.end, root.line, root.column], [0, TEXT.length, 1, 1]);
  });

  it('gives every node its path, key, type, depth, child count, preview and lossy flag', () => {
    assert.deepStrictEqual(root.children.map(summary), [
      ['$.name', 'name', 'string', 1, 0, '"x"', false],
      ['$.list', 'list', 'array', 1, 2, '', false],
      ['$.empty', 'empty', 'object', 1, 0, '', false],
      ['$.big', 'big', 'number', 1, 0, '12345678901234567890', true],
      ['$["odd key"]', 'odd key', 'null', 1, 0, 'null', false],
    ]);
    const list = root.children[1];
    assert.deepStrictEqual(list.children.map(summary), [
      ['$.list[0]', 0, 'number', 2, 0, '1', false],
      ['$.list[1]', 1, 'object', 2, 1, '', false],
    ]);
    assert.deepStrictEqual(summary(list.children[1].children[0]), ['$.list[1].deep', 'deep', 'boolean', 3, 0, 'true', false]);
  });

  it('keeps source positions for jumping to a node', () => {
    const [name, list] = root.children;
    assert.deepStrictEqual([name.line, name.column, list.line, list.column], [2, 11, 3, 11]);
    assert.equal(TEXT.slice(list.start, list.end), '[1, {"deep": true}]');
  });

  it('flags numbers that a JavaScript number cannot hold exactly', () => {
    const numbers = buildTree(parse('[0.1, 1.0, 1.5e3, 9007199254740993, 1e400, -1e-400, 12345678901234567890]').ast);
    assert.deepStrictEqual(numbers.children.map((node) => node.lossy), [false, false, false, true, true, true, true]);
  });

  it('shortens long previews to 80 characters', () => {
    const [node] = buildTree(parse(`["${'x'.repeat(200)}"]`).ast).children;
    assert.equal(node.preview.length, 80);
    assert.ok(node.preview.endsWith('…'));
  });

  it('handles a scalar document', () => {
    assert.deepStrictEqual(summary(buildTree(parse('42').ast)), ['$', null, 'number', 0, 0, '42', false]);
  });

  it('gives paths that the query box finds again', () => {
    const ast = parse('{"a b": {"c": [1, {"": 2, "x\\"y": 3, "şehir": 4, "0": 5, "\\ud800": 6}]}, "$": [[7]]}').ast;
    const all = flattenTree(buildTree(ast), expandToDepth(buildTree(ast), Infinity)).map((row) => row.node);
    assert.equal(all.length, 13);
    for (const node of all) {
      const matches = query(ast, node.path);
      assert.equal(matches.length, 1, node.path);
      assert.deepStrictEqual([matches[0].path, matches[0].node.start], [node.path, node.start]);
    }
  });
});

describe('flattenTree and expandToDepth', () => {
  const root = buildTree(parse(TEXT).ast);

  it('shows only the children of expanded containers, in document order', () => {
    assert.deepStrictEqual([...expandToDepth(root, 2)], ['$', '$.list']);
    const rows = flattenTree(root, expandToDepth(root, 2));
    assert.deepStrictEqual(rowPaths(rows), ['$', '$.name', '$.list', '$.list[0]', '$.list[1]', '$.empty', '$.big', '$["odd key"]']);
    assert.deepStrictEqual(rows.map((row) => row.expanded), [true, false, true, false, false, false, false, false]);
  });

  it('opens everything with Infinity and nothing with 0', () => {
    assert.deepStrictEqual([...expandToDepth(root, Infinity)], ['$', '$.list', '$.list[1]']);
    assert.equal(flattenTree(root, expandToDepth(root, Infinity)).length, 9);
    assert.deepStrictEqual(rowPaths(flattenTree(root, expandToDepth(root, 0))), ['$']);
  });

  it('never marks an empty container as expanded', () => {
    const rows = flattenTree(root, new Set(['$', '$.empty']));
    assert.equal(rows.find((row) => row.node.path === '$.empty').expanded, false);
  });

  it('copes with the deepest documents', () => {
    const deep = buildTree(parse('['.repeat(1000) + ']'.repeat(1000)).ast);
    const expanded = expandToDepth(deep, Infinity);
    assert.equal(expanded.size, 999);
    const rows = flattenTree(deep, expanded);
    assert.equal(rows.length, 1000);
    assert.equal(rows.at(-1).node.depth, 999);
  });
});
