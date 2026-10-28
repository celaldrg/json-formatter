import { childEntries, isLossyNumber } from './ast.js';
import { preview } from './formatter.js';
import { appendPath, ROOT_PATH } from './path.js';

const PREVIEW_LENGTH = 80;

/**
 * @typedef {Object} TreeNode
 * @property {string} path query path, e.g. `$.users[0].name` (copy it, or paste it into a query)
 * @property {string|number|null} key member name, array index, or null for the root
 * @property {'object'|'array'|'string'|'number'|'boolean'|'null'} type
 * @property {number} depth 0 for the root
 * @property {number} count number of children (0 for scalars and empty containers)
 * @property {string} preview single-line JSON of a scalar ('' for containers)
 * @property {boolean} lossy numbers only: JavaScript cannot hold the literal exactly
 * @property {number} start source offset
 * @property {number} end source offset after the node
 * @property {number} line 1-based source line
 * @property {number} column 1-based source column
 * @property {TreeNode[]} children
 */

/**
 * @typedef {{node: TreeNode, expanded: boolean}} TreeRow
 */

/**
 * Builds the viewer model of a document: paths, types, child counts, previews and positions.
 * @param {import('./parser.js').Node} ast
 * @returns {TreeNode}
 */
export function buildTree(ast) {
  return buildNode(ast, null, ROOT_PATH, 0);
}

function buildNode(node, key, path, depth) {
  const isContainer = node.type === 'object' || node.type === 'array';
  const children = [];
  for (const [childKey, child] of childEntries(node)) {
    children.push(buildNode(child, childKey, appendPath(path, childKey), depth + 1));
  }
  return {
    path,
    key,
    type: node.type,
    depth,
    count: children.length,
    preview: isContainer ? '' : preview(node, PREVIEW_LENGTH),
    lossy: node.type === 'number' && isLossyNumber(node.raw),
    start: node.start,
    end: node.end,
    line: node.line,
    column: node.column,
    children,
  };
}

/**
 * Lists the rows a collapsible tree shows, in document order: the children of a node appear
 * only while its path is in `expanded`.
 * @param {TreeNode} root
 * @param {Set<string>} expanded paths of open containers
 * @returns {TreeRow[]}
 */
export function flattenTree(root, expanded) {
  const rows = [];
  const visit = (node) => {
    const open = node.count > 0 && expanded.has(node.path);
    rows.push({ node, expanded: open });
    if (open) for (const child of node.children) visit(child);
  };
  visit(root);
  return rows;
}

/**
 * @param {TreeNode} root
 * @param {number} depth containers shallower than this are opened (Infinity opens everything)
 * @returns {Set<string>} the expanded paths
 */
export function expandToDepth(root, depth) {
  const paths = new Set();
  const visit = (node) => {
    if (node.count === 0 || node.depth >= depth) return;
    paths.add(node.path);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return paths;
}
