import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toValue } from '../src/ast.js';
import { parse } from '../src/parser.js';
import { compileQuery, query, QueryError } from '../src/query.js';

// In these JavaScript strings `\\` is one backslash of the JSON text.
const STORE = parse(`{
  "store": {
    "books": [
      {"title": "A", "price": 8, "tags": ["x"]},
      {"title": "B", "price": 12},
      {"title": "C", "price": 5, "author": {"name": "Ada"}}
    ],
    "name": "Main",
    "first name": "Sam",
    "bike": {"color": "red", "price": 19}
  },
  "name": "root",
  "şehir": "İzmir"
}`).ast;

const paths = (expression, ast = STORE) => query(ast, expression).map((match) => match.path);
const values = (expression, ast = STORE) => query(ast, expression).map((match) => toValue(match.node));

describe('query', () => {
  it('follows names and indexes: $.a.b[0]', () => {
    const [match, ...rest] = query(STORE, '$.store.books[0].title');
    assert.deepStrictEqual(rest, []);
    assert.equal(match.path, '$.store.books[0].title');
    assert.deepStrictEqual(match.segments, ['store', 'books', 0, 'title']);
    assert.equal(match.node.value, 'A');
    assert.deepStrictEqual([match.node.line, match.node.column], [4, 17]);
  });

  it('searches all descendants: $..name', () => {
    assert.deepStrictEqual(paths('$..name'), ['$.name', '$.store.name', '$.store.books[2].author.name']);
    assert.deepStrictEqual(values('$..price'), [8, 12, 5, 19]);
  });

  it('expands every child with [*] and .*', () => {
    assert.deepStrictEqual(values('$.store.books[*].price'), [8, 12, 5]);
    assert.deepStrictEqual(paths('$[*]'), ['$.store', '$.name', '$.şehir']);
    assert.deepStrictEqual(paths('$.store.*'), ['$.store.books', '$.store.name', '$.store["first name"]', '$.store.bike']);
    assert.equal(paths('$..*').length, 22);
  });

  it('counts negative indexes from the end and ignores indexes out of range', () => {
    assert.deepStrictEqual(values('$.store.books[-1].title'), ['C']);
    assert.deepStrictEqual(paths('$.store.books[3]'), []);
    assert.deepStrictEqual(paths('$.store.books[-4]'), []);
  });

  it('reads quoted names with either quote and JSON escapes', () => {
    for (const expression of ['$.store["first name"]', "$.store['first name']", '$.store["first\\u0020name"]']) {
      assert.deepStrictEqual(values(expression), ['Sam'], expression);
    }
  });

  it('applies .. before a bracket', () => {
    assert.deepStrictEqual(paths('$..[0]'), ['$.store.books[0]', '$.store.books[0].tags[0]']);
    assert.deepStrictEqual(paths('$..["first name"]'), ['$.store["first name"]']);
  });

  it('accepts a missing $, Unicode names and spaces between steps', () => {
    assert.deepStrictEqual(paths('store.name'), ['$.store.name']);
    assert.deepStrictEqual(values('şehir'), ['İzmir']);
    assert.deepStrictEqual(values('  $.store.books[ 1 ] .title  '), ['B']);
  });

  it('returns the root for $ and for an empty query', () => {
    for (const expression of ['$', '']) {
      const [match, ...rest] = query(STORE, expression);
      assert.deepStrictEqual(rest, []);
      assert.deepStrictEqual([match.path, match.segments, match.node], ['$', [], STORE]);
    }
  });

  it('finds nothing where the type does not fit', () => {
    for (const expression of ['$.store[0]', '$.store.books.title', '$.name.*', '$.name[0]', '$.missing']) {
      assert.deepStrictEqual(paths(expression), [], expression);
    }
  });

  it('returns each node only once', () => {
    assert.deepStrictEqual(values('$..*..price'), [8, 12, 5, 19]);
  });

  it('copes with the deepest documents', () => {
    const deep = parse('['.repeat(1000) + ']'.repeat(1000)).ast;
    assert.equal(query(deep, '$..*').length, 999);
    assert.equal(paths('$..[0]', deep).at(-1), `$${'[0]'.repeat(999)}`);
  });
});

describe('compileQuery', () => {
  it('turns an expression into steps', () => {
    assert.deepStrictEqual(compileQuery('$..a[*][-1]'), [
      { descendants: true, selector: { kind: 'name', name: 'a' } },
      { descendants: false, selector: { kind: 'wildcard' } },
      { descendants: false, selector: { kind: 'index', index: -1 } },
    ]);
    assert.deepStrictEqual(compileQuery("$.a..*['b c'][2]"), [
      { descendants: false, selector: { kind: 'name', name: 'a' } },
      { descendants: true, selector: { kind: 'wildcard' } },
      { descendants: false, selector: { kind: 'name', name: 'b c' } },
      { descendants: false, selector: { kind: 'index', index: 2 } },
    ]);
  });

  const ERRORS = [
    { expression: '$.', column: 3, expected: ['name', '*'], found: null },
    { expression: '$..', column: 4, expected: ['name', '*'], found: null },
    { expression: '$.1a', column: 3, expected: ['name', '*'], found: '1' },
    { expression: '$x', column: 2, expected: ['.', '['], found: 'x' },
    { expression: '$.a b', column: 5, expected: ['.', '['], found: 'b' },
    { expression: '$.store[', column: 9, expected: ['*', 'index', 'string'], found: null },
    { expression: '$[x]', column: 3, expected: ['*', 'index', 'string'], found: 'x' },
    { expression: '$[0', column: 4, expected: [']'], found: null },
    { expression: '$["a"', column: 6, expected: [']'], found: null },
    { expression: '$[-]', column: 3, expected: ['index'], found: '-' },
    { expression: '$[99999999999999999999]', column: 3, expected: ['index'], found: '9' },
  ];

  for (const { expression, ...want } of ERRORS) {
    it(`rejects ${expression} at column ${want.column}`, () => {
      assert.throws(() => compileQuery(expression), (error) => {
        assert.ok(error instanceof QueryError);
        assert.deepStrictEqual(
          { code: error.code, line: error.line, column: error.column, offset: error.offset, expected: error.expected, found: error.found },
          { code: 'query-syntax', line: 1, offset: want.column - 1, ...want },
        );
        return true;
      });
    });
  }

  it('explains the problem in the message', () => {
    assert.throws(() => compileQuery('$.'), {
      name: 'QueryError',
      message: "Invalid query: expected a property name or '*' but found end of input",
    });
  });

  it('reports a broken quoted name with the string error', () => {
    assert.throws(() => compileQuery('$["a'), { name: 'QueryError', code: 'unterminated-string', column: 5 });
    assert.throws(() => compileQuery('$["\\x"]'), { code: 'invalid-escape', column: 4 });
  });
});
