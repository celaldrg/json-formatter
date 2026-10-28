import { sameNumber } from './ast.js';
import { appendPath, ROOT_PATH } from './path.js';

/**
 * @typedef {Object} Change
 * @property {'added'|'removed'|'changed'} type
 * @property {string} path where the documents differ, e.g. `$.users[2].email`
 * @property {import('./parser.js').Node|null} before the left node (null when added)
 * @property {import('./parser.js').Node|null} after the right node (null when removed)
 */

/**
 * Compares two documents by value. Objects are matched by key (key order is ignored and, as in
 * JSON.parse, the last duplicate wins); arrays are compared index by index; numbers are compared
 * exactly by their digits, so 1.0 equals 1 but ...890 differs from ...891.
 * @param {import('./parser.js').Node} left
 * @param {import('./parser.js').Node} right
 * @returns {Change[]} in document order; empty when the documents are equal
 */
export function diff(left, right) {
  const changes = [];
  compare(left, right, ROOT_PATH, changes);
  return changes;
}

/**
 * @param {Change[]} changes
 * @returns {{added: number, removed: number, changed: number}}
 */
export function countChanges(changes) {
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of changes) counts[change.type]++;
  return counts;
}

function compare(a, b, path, changes) {
  if (a.type === b.type && (a.type === 'object' || a.type === 'array')) {
    for (const entry of align(a, b, path)) {
      if (entry.type === 'pair') compare(entry.before, entry.after, entry.path, changes);
      else changes.push(entry);
    }
  } else if (a.type !== b.type || !sameScalar(a, b)) {
    changes.push({ type: 'changed', path, before: a, after: b });
  }
}

/** Lines up the children of two containers of the same type as pairs, removals and additions. */
function align(a, b, path) {
  return a.type === 'object' ? alignMembers(a, b, path) : alignItems(a, b, path);
}

function alignMembers(a, b, path) {
  const left = membersByName(a);
  const right = membersByName(b);
  const entries = [];
  for (const [name, before] of left) {
    const after = right.get(name);
    entries.push({ type: after === undefined ? 'removed' : 'pair', path: appendPath(path, name), before, after: after ?? null });
  }
  for (const [name, after] of right) {
    if (!left.has(name)) entries.push({ type: 'added', path: appendPath(path, name), before: null, after });
  }
  return entries;
}

function alignItems(a, b, path) {
  const entries = [];
  const length = Math.max(a.items.length, b.items.length);
  for (let index = 0; index < length; index++) {
    const before = a.items[index] ?? null;
    const after = b.items[index] ?? null;
    const type = before === null ? 'added' : after === null ? 'removed' : 'pair';
    entries.push({ type, path: appendPath(path, index), before, after });
  }
  return entries;
}

/** Member values by name; a later duplicate replaces the value but keeps the first position. */
function membersByName(node) {
  const map = new Map();
  for (const member of node.members) map.set(member.key.value, member.value);
  return map;
}

function sameScalar(a, b) {
  return a.type === 'number' ? sameNumber(a.raw, b.raw) : a.value === b.value;
}
