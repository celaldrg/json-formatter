import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalNumber, childEntries, isLossyNumber, sameNumber, toValue } from '../src/ast.js';
import { parse } from '../src/parser.js';

const ast = (text) => parse(text).ast;

describe('toValue', () => {
  it('returns what JSON.parse returns', () => {
    for (const text of ['{"a": [1, {"b": null}], "c": "x", "d": true}', '[]', '"s"', '-1.5e3', '12345678901234567890']) {
      assert.deepStrictEqual(toValue(ast(text)), JSON.parse(text), text);
    }
  });

  it('lets the last duplicate key win in the position of the first, as JSON.parse does', () => {
    const text = '{"a": 1, "b": 2, "a": 3}';
    assert.deepStrictEqual(Object.entries(toValue(ast(text))), [['a', 3], ['b', 2]]);
    assert.deepStrictEqual(Object.entries(toValue(ast(text))), Object.entries(JSON.parse(text)));
  });

  it('makes "__proto__" an own property instead of changing the prototype', () => {
    const value = toValue(ast('{"__proto__": {"polluted": true}, "a": 1}'));
    assert.ok(Object.hasOwn(value, '__proto__'));
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.deepStrictEqual([value.polluted, {}.polluted], [undefined, undefined]);
    assert.deepStrictEqual(value, JSON.parse('{"__proto__": {"polluted": true}, "a": 1}'));
  });
});

describe('childEntries', () => {
  it('pairs member names and array indexes with their nodes, duplicates included', () => {
    const object = ast('{"a": 1, "b": [true], "a": null}');
    assert.deepStrictEqual(childEntries(object).map(([key, node]) => [key, node.type]), [['a', 'number'], ['b', 'array'], ['a', 'null']]);
    assert.deepStrictEqual(childEntries(object.members[1].value).map(([key, node]) => [key, node.value]), [[0, true]]);
  });

  it('has no children for scalars', () => {
    for (const text of ['1', '"a"', 'null', 'false']) assert.deepStrictEqual(childEntries(ast(text)), []);
  });
});

describe('canonicalNumber', () => {
  const CASES = [
    ['0', '0'],
    ['-0', '0'],
    ['0.000', '0'],
    ['-0.0e5', '0'],
    ['1', '1e0'],
    ['100', '1e2'],
    ['1.50', '15e-1'],
    ['15e-1', '15e-1'],
    ['0.15E1', '15e-1'],
    ['-2.5E+3', '-25e2'],
    ['0.001', '1e-3'],
    ['1e+21', '1e21'],
    ['12345678901234567890', '1234567890123456789e1'],
    ['1e-400', '1e-400'],
    ['1e99999999999999999999', '1e99999999999999999999'],
  ];

  for (const [raw, canonical] of CASES) {
    it(`writes ${raw} as ${canonical}`, () => assert.equal(canonicalNumber(raw), canonical));
  }

  it('rejects text that is not a number literal', () => {
    for (const raw of ['', 'Infinity', 'NaN', '1.', '.5', '+1', '1e', '0x10', ' 1', '1_000']) {
      assert.equal(canonicalNumber(raw), null, raw);
    }
  });
});

describe('sameNumber', () => {
  it('compares exact values, whatever the spelling', () => {
    assert.ok(sameNumber('1', '1.0'));
    assert.ok(sameNumber('100', '1E2'));
    assert.ok(sameNumber('0', '-0.0'));
    assert.ok(sameNumber('123456789012345678901234567890', '1.2345678901234567890123456789e29'));
  });

  it('tells apart numbers that round to the same double', () => {
    assert.equal(Number('12345678901234567890') === Number('12345678901234567891'), true);
    assert.equal(sameNumber('12345678901234567890', '12345678901234567891'), false);
    assert.equal(sameNumber('0.1', '0.10000000000000001'), false);
  });
});

describe('isLossyNumber', () => {
  it('is false when a JavaScript number keeps the value', () => {
    for (const raw of ['0', '-0', '1.0', '1.50', '1.5e3', '0.1', '9007199254740991', '9007199254740992', '1e21', '1E2', '100000000000000000000', '5e-324']) {
      assert.equal(isLossyNumber(raw), false, raw);
    }
  });

  it('is true when JSON.parse would change the value', () => {
    for (const raw of ['9007199254740993', '12345678901234567890', '123456789012345678', '0.1000000000000000055511151231257827', '1e400', '-1e400', '1e-400']) {
      assert.equal(isLossyNumber(raw), true, raw);
      assert.equal(sameNumber(JSON.stringify(JSON.parse(raw)), raw), false, raw);
    }
  });
});
