/**
 * Helpers for parser AST nodes: plain values, children and exact number comparison.
 */

const NUMBER_PARTS = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * Converts an AST node into the plain value JSON.parse would return (duplicate keys: last wins,
 * "__proto__" becomes an own property). Numbers are JavaScript numbers here; use `raw` for exact digits.
 * @param {import('./parser.js').Node} node
 * @returns {*}
 */
export function toValue(node) {
  if (node.type === 'array') return node.items.map(toValue);
  if (node.type !== 'object') return node.value;
  const object = {};
  for (const { key, value } of node.members) {
    Object.defineProperty(object, key.value, { value: toValue(value), enumerable: true, writable: true, configurable: true });
  }
  return object;
}

/**
 * Children of a container as [key, node] pairs: member names for objects, indexes for arrays.
 * @param {import('./parser.js').Node} node
 * @returns {Array<[string|number, import('./parser.js').Node]>} empty for scalars
 */
export function childEntries(node) {
  if (node.type === 'object') return node.members.map((member) => [member.key.value, member.value]);
  if (node.type === 'array') return node.items.map((item, index) => [index, item]);
  return [];
}

/**
 * Canonical form of a JSON number literal, so equal values compare equal however they are
 * written: "1.50", "15e-1" and "0.15E1" all become "15e-1"; every zero becomes "0".
 * Works on the exact decimal digits, so huge or very precise numbers are never rounded.
 * @param {string} raw a strict JSON number literal (or a JavaScript number's string form)
 * @returns {string|null} null when `raw` is not a number literal (e.g. "Infinity")
 */
export function canonicalNumber(raw) {
  const match = NUMBER_PARTS.exec(raw);
  if (!match) return null;
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const digits = (whole + fraction).replace(/^0+/, '');
  if (digits === '') return '0';
  const significant = digits.replace(/0+$/, '');
  const scale = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length);
  return `${sign}${significant}e${scale}`;
}

/**
 * @param {string} a number literal
 * @param {string} b number literal
 * @returns {boolean} true when both literals denote exactly the same number
 */
export function sameNumber(a, b) {
  return canonicalNumber(a) === canonicalNumber(b);
}

/**
 * Tells whether reading the literal into a JavaScript number changes its value, so that
 * JSON.stringify(JSON.parse(raw)) would write a different number: true for 12345678901234567890,
 * 0.1000000000000000055511151231257827 or 1e400, false for 0.1, 1.50 or 1e21.
 * The formatter keeps every literal as written; the tree marks these ones.
 * @param {string} raw a strict JSON number literal
 * @returns {boolean}
 */
export function isLossyNumber(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return true;
  const shortest = String(value);
  return shortest !== raw && !sameNumber(shortest, raw);
}
