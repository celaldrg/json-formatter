import { childEntries } from './ast.js';
import { errorMessage } from './i18n.js';
import { Lexer } from './lexer.js';
import { formatPath } from './path.js';
import { charAt, describeChar, isDigit, isIdentifierPart, isIdentifierStart } from './text.js';

const WILDCARD = Object.freeze({ kind: 'wildcard' });

/**
 * @typedef {{kind: 'name', name: string} | {kind: 'index', index: number} | {kind: 'wildcard'}} Selector
 * @typedef {{descendants: boolean, selector: Selector}} Step
 * @typedef {{path: string, segments: Array<string|number>, node: import('./parser.js').Node}} Match
 */

/**
 * A syntax error in a query. A query is one line, so `line` is always 1 and `column` is the
 * 1-based position; the fields match JsonSyntaxError, so errorMessage/errorLocation work for both.
 */
export class QueryError extends SyntaxError {
  /** @param {{code: string, offset: number, expected?: string[], found?: string|null}} details */
  constructor(details) {
    super(errorMessage(details, 'en'));
    this.name = 'QueryError';
    this.code = details.code;
    this.offset = details.offset;
    this.line = 1;
    this.column = details.offset + 1;
    this.expected = details.expected ?? [];
    this.found = details.found ?? null;
  }
}

/**
 * Compiles a query of the supported subset: `$` (optional), `.name`, `["any name"]`, `['name']`,
 * `[0]`, `[-1]` (from the end), `.*`, `[*]`, and `..` before any of them to search all descendants.
 * @param {string} expression e.g. `$.store.books[0].title`, `$..name`, `$.items[*].id`
 * @returns {Step[]}
 * @throws {QueryError}
 */
export function compileQuery(expression) {
  return new QueryParser(expression).parse();
}

/**
 * Runs a query and returns each matching node once, in JSONPath order: members and items in
 * source order, and for `..` the matches of a node before those of its descendants.
 * @param {import('./parser.js').Node} ast
 * @param {string} expression
 * @returns {Match[]}
 * @throws {QueryError}
 */
export function query(ast, expression) {
  let matches = [{ segments: [], node: ast }];
  for (const step of compileQuery(expression)) {
    const scope = step.descendants ? matches.flatMap(withDescendants) : matches;
    matches = scope.flatMap((match) => select(match, step.selector));
  }
  const seen = new Set();
  return matches
    .filter(({ node }) => !seen.has(node) && seen.add(node))
    .map(({ segments, node }) => ({ path: formatPath(segments), segments, node }));
}

function withDescendants(match) {
  const all = [];
  const visit = (current) => {
    all.push(current);
    for (const [key, node] of childEntries(current.node)) visit({ segments: [...current.segments, key], node });
  };
  visit(match);
  return all;
}

function select({ segments, node }, selector) {
  if (selector.kind === 'wildcard') {
    return childEntries(node).map(([key, child]) => ({ segments: [...segments, key], node: child }));
  }
  if (selector.kind === 'name') {
    if (node.type !== 'object') return [];
    return node.members
      .filter((member) => member.key.value === selector.name)
      .map((member) => ({ segments: [...segments, selector.name], node: member.value }));
  }
  if (node.type !== 'array') return [];
  const index = selector.index < 0 ? node.items.length + selector.index : selector.index;
  if (index < 0 || index >= node.items.length) return [];
  return [{ segments: [...segments, index], node: node.items[index] }];
}

class QueryParser {
  constructor(source) {
    this.source = source;
    this.pos = 0;
  }

  parse() {
    const steps = [];
    this.skipSpaces();
    if (this.source[this.pos] === '$') this.pos++;
    else if (isIdentifierStart(charAt(this.source, this.pos))) steps.push({ descendants: false, selector: this.name() });
    for (this.skipSpaces(); this.pos < this.source.length; this.skipSpaces()) steps.push(this.step());
    return steps;
  }

  step() {
    if (this.source[this.pos] === '[') return { descendants: false, selector: this.bracket() };
    if (this.source[this.pos] !== '.') this.fail(['.', '[']);
    const descendants = this.source[this.pos + 1] === '.';
    this.pos += descendants ? 2 : 1;
    if (this.source[this.pos] === '*') {
      this.pos++;
      return { descendants, selector: WILDCARD };
    }
    if (descendants && this.source[this.pos] === '[') return { descendants, selector: this.bracket() };
    return { descendants, selector: this.name() };
  }

  name() {
    const start = this.pos;
    for (let char = charAt(this.source, this.pos); char !== ''; char = charAt(this.source, this.pos)) {
      const allowed = this.pos === start ? isIdentifierStart(char) : isIdentifierPart(char);
      if (!allowed) break;
      this.pos += char.length;
    }
    if (this.pos === start) this.fail(['name', '*']);
    return { kind: 'name', name: this.source.slice(start, this.pos) };
  }

  bracket() {
    this.pos++;
    this.skipSpaces();
    const char = this.source[this.pos];
    let selector;
    if (char === '*') {
      this.pos++;
      selector = WILDCARD;
    } else if (char === '"' || char === "'") {
      selector = { kind: 'name', name: this.quoted() };
    } else if (char === '-' || isDigit(this.source.charCodeAt(this.pos))) {
      selector = { kind: 'index', index: this.index() };
    } else {
      this.fail(['*', 'index', 'string']);
    }
    this.skipSpaces();
    if (this.source[this.pos] !== ']') this.fail([']']);
    this.pos++;
    return selector;
  }

  /** Reads a quoted name with JSON escapes, reusing the JSON string scanner. */
  quoted() {
    const token = new Lexer(this.source, true, this.pos).next();
    if (token.error) throw new QueryError(token.error);
    this.pos = token.end;
    return token.value;
  }

  index() {
    const digits = /^-?\d+/.exec(this.source.slice(this.pos))?.[0];
    if (digits === undefined || !Number.isSafeInteger(Number(digits))) this.fail(['index']);
    this.pos += digits.length;
    return Number(digits);
  }

  skipSpaces() {
    while (this.source[this.pos] === ' ' || this.source[this.pos] === '\t') this.pos++;
  }

  fail(expected) {
    const found = describeChar(charAt(this.source, this.pos));
    throw new QueryError({ code: 'query-syntax', offset: this.pos, expected, found });
  }
}
