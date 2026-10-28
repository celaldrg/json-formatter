import { countChanges, diff } from './diff.js';
import { formatSegments, INDENTS } from './formatter.js';
import { tryParse } from './parser.js';
import { query, QueryError } from './query.js';
import { repair } from './repair.js';
import { DEMO, SAMPLES } from './samples.js';
import { buildTree, expandToDepth, flattenTree } from './tree.js';

/** Output modes: pretty-printed with the chosen indent, or minified. */
export const MODES = Object.freeze(['pretty', 'minify']);

/** Output tabs. */
export const TABS = Object.freeze(['formatted', 'tree', 'diff']);

/** Containers shallower than this start expanded when a new document is loaded. */
const DEFAULT_EXPAND_DEPTH = 2;

/** Nothing but JSON whitespace: space, tab, line feed and carriage return. */
const JSON_WHITESPACE = /^[ \t\n\r]*$/;

const DEFAULTS = Object.freeze({
  input: '',
  compare: '',
  query: '',
  relaxed: false,
  indent: 2,
  sortKeys: false,
  mode: 'pretty',
  tab: 'formatted',
});

const VALIDATORS = Object.freeze({
  input: isString,
  compare: isString,
  query: isString,
  relaxed: isBoolean,
  sortKeys: isBoolean,
  indent: (value) => INDENTS.includes(value),
  mode: (value) => MODES.includes(value),
  tab: (value) => TABS.includes(value),
});

/**
 * @typedef {typeof DEFAULTS} Settings
 * @typedef {Settings & {
 *   status: 'empty'|'valid'|'invalid',
 *   error: import('./errors.js').JsonSyntaxError|null,
 *   repairs: import('./parser.js').Repair[],
 *   stale: boolean,
 *   hasDocument: boolean,
 * }} WorkspaceState
 * @typedef {ReturnType<typeof createWorkspace>} Workspace
 */

/**
 * Creates the state behind the UI: the input text and settings, the parse status of the input
 * and the derived views (formatted output, tree rows, diff, query matches). While the input has
 * a syntax error the views keep showing the last valid document (`stale` is true), so the output
 * does not vanish while the user types. Derived views are computed on demand and cached.
 * @param {Partial<Settings>} [initial] invalid values are ignored
 */
export function createWorkspace(initial = {}) {
  const settings = { ...DEFAULTS };
  let parsed = null;
  let documentAst = null;
  let expanded = new Set();
  let sampleIndex = -1;
  const cached = {
    output: memoize((ast, indent, sortKeys, mode) => renderOutput(ast, { indent: mode === 'minify' ? 0 : indent, sortKeys })),
    tree: memoize(buildTree),
    compare: memoize((text, relaxed) => tryParse(text, { relaxed })),
    diff: memoize(diff),
    query: memoize(query),
  };

  function applySettings(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (Object.hasOwn(VALIDATORS, key) && VALIDATORS[key](value)) settings[key] = value;
    }
  }

  function reparse() {
    parsed = isBlank(settings.input) ? null : tryParse(settings.input, { relaxed: settings.relaxed });
    if (parsed === null) setDocument(null);
    else if (parsed.ok) setDocument(parsed.ast);
  }

  function setDocument(ast) {
    const fresh = documentAst === null;
    documentAst = ast;
    if (ast === null) expanded = new Set();
    else if (fresh) expanded = expandToDepth(cached.tree(ast), DEFAULT_EXPAND_DEPTH);
  }

  function tree() {
    return documentAst === null ? null : cached.tree(documentAst);
  }

  /** @returns {WorkspaceState} a snapshot of the settings and the input's parse status */
  function getState() {
    return {
      ...settings,
      status: parsed === null ? 'empty' : parsed.ok ? 'valid' : 'invalid',
      error: parsed?.ok === false ? parsed.error : null,
      repairs: parsed?.ok ? parsed.repairs : [],
      stale: parsed?.ok === false && documentAst !== null,
      hasDocument: documentAst !== null,
    };
  }

  /**
   * Changes settings (input, compare, query, relaxed, indent, sortKeys, mode, tab).
   * Editing the input keeps the tree's expanded paths.
   * @param {Partial<Settings>} patch
   */
  function update(patch) {
    applySettings(patch);
    if ('input' in patch || 'relaxed' in patch) reparse();
  }

  /**
   * Replaces the input with a new document (opened file, sample); the tree expansion starts over.
   * @param {string} text
   */
  function load(text) {
    documentAst = null;
    applySettings({ input: text });
    reparse();
  }

  /**
   * Loads the next sample document, cycling through SAMPLES.
   * @returns {number} the index of the loaded sample
   */
  function loadSample() {
    sampleIndex = (sampleIndex + 1) % SAMPLES.length;
    load(SAMPLES[sampleIndex]);
    return sampleIndex;
  }

  /**
   * Rewrites the input as strict JSON with minimal edits (see repair()).
   * @returns {{ok: boolean, count: number, error: import('./errors.js').JsonSyntaxError|null}}
   */
  function repairInput() {
    const result = repair(settings.input);
    if (!result.ok) return { ok: false, count: 0, error: result.error };
    if (result.repairs.length > 0) {
      settings.input = result.text;
      reparse();
    }
    return { ok: true, count: result.repairs.length, error: null };
  }

  /**
   * The formatted (or minified) document as text and as highlighted segments.
   * @returns {{text: string, segments: import('./formatter.js').Segment[]}|null} null without a document
   */
  function output() {
    if (documentAst === null) return null;
    return cached.output(documentAst, settings.indent, settings.sortKeys, settings.mode);
  }

  /** @returns {import('./tree.js').TreeRow[]} the visible rows of the tree view */
  function rows() {
    const root = tree();
    return root === null ? [] : flattenTree(root, expanded);
  }

  /**
   * Opens or closes one container of the tree.
   * @param {string} path
   * @returns {boolean} true if the container is now open
   */
  function toggle(path) {
    expanded = new Set(expanded);
    const open = !expanded.delete(path);
    if (open) expanded.add(path);
    return open;
  }

  /** Opens every container of the tree. */
  function expandAll() {
    const root = tree();
    expanded = root === null ? new Set() : expandToDepth(root, Infinity);
  }

  /** Closes every container except the root, so the top level stays visible. */
  function collapseAll() {
    const root = tree();
    expanded = root === null ? new Set() : expandToDepth(root, 1);
  }

  /**
   * Compares the document with the second document (`compare`), parsed in the same mode.
   * @returns {{status: 'empty'} | {status: 'no-document'}
   *   | {status: 'invalid', error: import('./errors.js').JsonSyntaxError}
   *   | {status: 'ok', changes: import('./diff.js').Change[], counts: {added: number, removed: number, changed: number}}}
   */
  function diffResult() {
    if (isBlank(settings.compare)) return { status: 'empty' };
    if (documentAst === null) return { status: 'no-document' };
    const other = cached.compare(settings.compare, settings.relaxed);
    if (!other.ok) return { status: 'invalid', error: other.error };
    const changes = cached.diff(documentAst, other.ast);
    return { status: 'ok', changes, counts: countChanges(changes) };
  }

  /**
   * Runs the query box against the document.
   * @returns {null | {ok: true, matches: import('./query.js').Match[]} | {ok: false, error: QueryError}}
   *   null when the query is blank or there is no document
   */
  function queryResult() {
    if (isBlank(settings.query) || documentAst === null) return null;
    try {
      return { ok: true, matches: cached.query(documentAst, settings.query) };
    } catch (error) {
      if (error instanceof QueryError) return { ok: false, error };
      throw error;
    }
  }

  applySettings(initial);
  reparse();
  return { getState, update, load, loadSample, repair: repairInput, output, rows, toggle, expandAll, collapseAll, diff: diffResult, queryResult };
}

/**
 * Builds the ?demo state for the README screenshot: the sample project formatted in the tree
 * view, next to an input with exactly one syntax error (a missing comma) marked.
 * @returns {Workspace}
 */
export function createDemoWorkspace() {
  const workspace = createWorkspace({ input: DEMO.document, compare: DEMO.compare, tab: 'tree' });
  workspace.update({ input: DEMO.broken });
  return workspace;
}

function renderOutput(ast, options) {
  const segments = formatSegments(ast, options);
  return { text: segments.map((segment) => segment.text).join(''), segments };
}

/** Caches the last result of `fn` for arguments identical (===) to those of the previous call. */
function memoize(fn) {
  let lastArgs = null;
  let lastResult;
  return (...args) => {
    const same = lastArgs !== null && args.length === lastArgs.length && args.every((arg, index) => arg === lastArgs[index]);
    if (!same) {
      lastResult = fn(...args);
      lastArgs = args;
    }
    return lastResult;
  };
}

/**
 * Blank means JSON whitespace only. Other invisible characters, such as a no-break space or a
 * byte order mark, are not blank: the parser reports them where they are.
 */
function isBlank(text) {
  return JSON_WHITESPACE.test(text);
}

function isString(value) {
  return typeof value === 'string';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}
