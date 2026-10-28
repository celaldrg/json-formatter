import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { childEntries, toValue } from '../src/ast.js';
import { format } from '../src/formatter.js';
import { parse, tryParse } from '../src/parser.js';
import { repair } from '../src/repair.js';

const DOCUMENTS = 500;
/** [our indent option, the matching JSON.stringify space argument] */
const INDENTS = [[2, 2], [4, 4], ['tab', '\t'], [0, 0]];
const MAX_GENERATED_DEPTH = 5;

// In these JavaScript strings `\\` is one backslash of the JSON text.
const PLAIN = ['a', 'b', 'Z', '0', '9', ' ', '-', '_', '.', '$', '#', '/', '~', 'é', 'ş', 'İ', '中'];
const SHORT_ESCAPES = ['\\\\', '\\/', '\\b', '\\f', '\\n', '\\r', '\\t'];
const RAW_SPECIALS = [String.fromCodePoint(0x1f600), String.fromCharCode(0x2028), String.fromCharCode(0x7f)];
/** Quote pieces: how they are written inside double quotes (dq) and inside single quotes (sq). */
const DOUBLE_QUOTE = { dq: '\\"', sq: '"' };
const SINGLE_QUOTE = { dq: "'", sq: "\\'" };
const KEY_POOL = ['a', 'b', 'id', '', '__proto__'];
const IDENTIFIER_KEYS = ['name', 'id', '$ref', '_x', 'a1', 'café', 'şehir', 'null'];
const SPACES = [' ', '  ', '\n', '\t', '\r\n', '\r', '\n    '];
const BLOCK_COMMENTS = ['/* note */', '/** stars **/', '/* // not a line comment */', '/*\n multi-line\n*/'];
const LINE_COMMENTS = ['// note', '//', '// /* not a block comment'];

/** mulberry32: a small seeded generator, so every run sees the same documents. */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Writes one random document twice: as strict JSON (`strict`) and, in relaxed mode, as the same
 * document with comments, trailing commas, single quotes and unquoted keys mixed in (`loose`).
 * `constructs` counts the relaxed constructs it added. Strict documents use random whitespace,
 * escapes of every kind, lone surrogates, duplicate keys and number spellings JSON allows.
 */
class DocumentWriter {
  constructor(seed, relaxed) {
    this.rng = createRng(seed);
    this.relaxed = relaxed;
    this.strict = '';
    this.loose = '';
    this.constructs = 0;
  }

  chance(probability) {
    return this.rng() < probability;
  }

  int(limit) {
    return Math.floor(this.rng() * limit);
  }

  pick(items) {
    return items[this.int(items.length)];
  }

  emit(strict, loose = strict) {
    this.strict += strict;
    this.loose += loose;
  }

  /** Adds text that only the relaxed version has. */
  relax(loose) {
    this.constructs++;
    this.emit('', loose);
  }

  document() {
    this.gap();
    this.value(0);
    this.gap();
    return this;
  }

  gap() {
    if (this.chance(0.4)) this.emit(this.pick(SPACES));
    if (this.relaxed && this.chance(0.15)) this.comment();
  }

  comment() {
    if (this.chance(0.5)) {
      this.relax(this.pick(BLOCK_COMMENTS));
    } else {
      this.relax(this.pick(LINE_COMMENTS));
      this.emit(this.pick(['\n', '\r\n', '\r']));
    }
    if (this.chance(0.5)) this.emit(' ');
  }

  /** A random value; the root is usually a non-empty container. */
  value(depth) {
    const roll = this.rng();
    const containers = depth >= MAX_GENERATED_DEPTH ? 0 : depth === 0 ? 0.9 : 0.5;
    const count = this.int(5) + (depth === 0 ? 1 : 0);
    if (roll < containers / 2) this.container('[', ']', count, () => this.value(depth + 1));
    else if (roll < containers) this.container('{', '}', count, () => this.member(depth + 1));
    else if (roll < 0.95) this.scalar();
    else this.emit(this.pick(['true', 'false', 'null']));
  }

  scalar() {
    if (this.chance(0.5)) this.string(this.pieces());
    else this.emit(this.number());
  }

  container(open, close, count, writeEntry) {
    this.emit(open);
    for (let index = 0; index < count; index++) {
      if (index > 0) this.emit(',');
      this.gap();
      writeEntry();
      this.gap();
    }
    if (count > 0 && this.relaxed && this.chance(0.3)) {
      this.relax(',');
      this.gap();
    }
    if (count === 0) this.gap();
    this.emit(close);
  }

  member(depth) {
    this.key();
    this.gap();
    this.emit(':');
    this.gap();
    this.value(depth);
  }

  key() {
    if (this.relaxed && this.chance(0.25)) {
      const name = this.pick(IDENTIFIER_KEYS);
      this.constructs++;
      this.emit(`"${name}"`, name);
    } else if (this.chance(0.3)) {
      this.string([...this.pick(KEY_POOL)].map((char) => ({ dq: char, sq: char })));
    } else {
      this.string(this.pieces());
    }
  }

  string(pieces) {
    const strict = `"${pieces.map((piece) => piece.dq).join('')}"`;
    if (this.relaxed && this.chance(0.3)) {
      this.constructs++;
      this.emit(strict, `'${pieces.map((piece) => piece.sq).join('')}'`);
    } else {
      this.emit(strict);
    }
  }

  pieces() {
    return Array.from({ length: this.int(8) }, () => this.piece());
  }

  piece() {
    const roll = this.rng();
    if (roll < 0.45) return same(this.pick(PLAIN));
    if (roll < 0.5) return this.pick([DOUBLE_QUOTE, SINGLE_QUOTE]);
    if (roll < 0.65) return same(this.pick(SHORT_ESCAPES));
    if (roll < 0.8) return same(`\\u${this.hex4()}`);
    if (roll < 0.9) return same(this.surrogatePair());
    return same(this.pick(RAW_SPECIALS));
  }

  /** Four hex digits in random case: any UTF-16 unit, control characters and lone surrogates included. */
  hex4() {
    const digits = this.int(0x10000).toString(16).padStart(4, '0');
    return [...digits].map((digit) => (this.chance(0.5) ? digit.toUpperCase() : digit)).join('');
  }

  surrogatePair() {
    const high = 0xd800 + this.int(0x400);
    const low = 0xdc00 + this.int(0x400);
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  }

  number() {
    const sign = this.chance(0.3) ? '-' : '';
    const whole = this.chance(0.2) ? '0' : this.digits(1 + this.int(this.chance(0.1) ? 25 : 5), true);
    const fraction = this.chance(0.4) ? `.${this.digits(1 + this.int(this.chance(0.1) ? 25 : 4))}` : '';
    const exponent = this.chance(0.2) ? this.pick(['e', 'E']) + this.pick(['', '+', '-']) + this.digits(1 + this.int(3)) : '';
    return sign + whole + fraction + exponent;
  }

  digits(count, nonZeroFirst = false) {
    let text = nonZeroFirst ? String(1 + this.int(9)) : '';
    while (text.length < count) text += String(this.int(10));
    return text;
  }
}

function same(text) {
  return { dq: text, sq: text };
}

/** Reference line and column of an offset: \r\n, \n and \r each end a line. */
function lineColumn(text, offset) {
  const before = text.slice(0, offset);
  const breaks = before.match(/\r\n|\r|\n/g) ?? [];
  const lastBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
  return { line: breaks.length + 1, column: offset - lastBreak };
}

/** Every node of an AST, member keys included. */
function allNodes(ast) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    if (node.type === 'object') {
      for (const member of node.members) {
        visit(member.key);
        visit(member.value);
      }
    }
    if (node.type === 'array') node.items.forEach(visit);
  };
  visit(ast);
  return nodes;
}

function assertSortedKeys(node, message) {
  if (node.type === 'object') {
    const names = node.members.map((member) => member.key.value);
    names.slice(1).forEach((name, index) => assert.ok(names[index] <= name, message));
  }
  for (const [, child] of childEntries(node)) assertSortedKeys(child, message);
}

/**
 * The first DOCUMENTS documents that seeds firstSeed, firstSeed + 1, … write. A seed whose text
 * repeats an earlier one (a bare `true`, say) is skipped, so every document is different.
 */
function distinctDocuments(firstSeed, write, textOf) {
  const documents = [];
  const seen = new Set();
  for (let seed = firstSeed; documents.length < DOCUMENTS; seed += 1) {
    const document = { seed, ...write(seed) };
    if (seen.has(textOf(document))) continue;
    seen.add(textOf(document));
    documents.push(document);
  }
  return documents;
}

describe(`${DOCUMENTS} seeded random strict documents`, () => {
  const documents = distinctDocuments(
    1,
    (seed) => ({ text: new DocumentWriter(seed, false).document().strict }),
    (document) => document.text,
  );

  it('are generated deterministically and are all different', () => {
    assert.equal(documents.length, DOCUMENTS);
    assert.equal(new DocumentWriter(42, false).document().strict, new DocumentWriter(42, false).document().strict);
    assert.equal(new Set(documents.map((document) => document.text)).size, DOCUMENTS);
    const containers = documents.filter(({ text }) => /^\s*[[{]/.test(text)).length;
    assert.ok(containers > DOCUMENTS * 0.8);
  });

  it('parse to exactly what JSON.parse returns', () => {
    for (const { seed, text } of documents) {
      assert.deepStrictEqual(toValue(parse(text).ast), JSON.parse(text), `seed ${seed}: ${text}`);
    }
  });

  it('round-trip: parse → format → JSON.parse equals JSON.parse(input) for every indent, sorted or not', () => {
    for (const { seed, text } of documents) {
      const expected = JSON.parse(text);
      const { ast } = parse(text);
      for (const [indent] of INDENTS) {
        assert.deepStrictEqual(JSON.parse(format(ast, { indent })), expected, `seed ${seed}, indent ${indent}`);
      }
      const sorted = format(ast, { indent: 2, sortKeys: true });
      assert.deepStrictEqual(JSON.parse(sorted), expected, `seed ${seed}, sorted`);
      assertSortedKeys(parse(sorted).ast, `seed ${seed}, sorted`);
    }
  });

  it('format exactly like JSON.stringify for JSON.stringify output', () => {
    for (const { seed, text } of documents) {
      const value = JSON.parse(text);
      const { ast } = parse(JSON.stringify(value));
      for (const [indent, space] of INDENTS) {
        assert.equal(format(ast, { indent }), JSON.stringify(value, null, space), `seed ${seed}, indent ${indent}`);
      }
    }
  });

  it('give every node the line and column of its first character and its exact source span', () => {
    for (const { seed, text } of documents) {
      for (const node of allNodes(parse(text).ast)) {
        const message = `seed ${seed}, offset ${node.start}`;
        assert.deepStrictEqual({ line: node.line, column: node.column }, lineColumn(text, node.start), message);
        const source = text.slice(node.start, node.end);
        if ('raw' in node) assert.equal(source, node.raw, message);
        else assert.deepStrictEqual(JSON.parse(source), toValue(node), message);
      }
    }
  });

  it('need no repair', () => {
    for (const { seed, text } of documents) {
      assert.deepStrictEqual(repair(text), { ok: true, text, repairs: [] }, `seed ${seed}`);
    }
  });
});

describe(`${DOCUMENTS} seeded random relaxed documents`, () => {
  const documents = distinctDocuments(
    10_000,
    (seed) => {
      const writer = new DocumentWriter(seed, true).document();
      return { strict: writer.strict, loose: writer.loose, constructs: writer.constructs };
    },
    (document) => document.loose,
  );

  it('mix in every kind of relaxed construct', () => {
    const kinds = new Set(documents.flatMap(({ loose }) => parse(loose, { relaxed: true }).repairs.map((item) => item.kind)));
    assert.deepStrictEqual([...kinds].sort(), ['comment', 'single-quote', 'trailing-comma', 'unquoted-key']);
    assert.ok(documents.filter((document) => document.constructs > 0).length > DOCUMENTS * 0.8);
    assert.equal(new Set(documents.map(({ loose }) => loose)).size, DOCUMENTS);
  });

  it('parse in relaxed mode with one repair per construct and the value of the strict twin', () => {
    for (const { seed, strict, loose, constructs } of documents) {
      const { ast, repairs } = parse(loose, { relaxed: true });
      const expected = JSON.parse(strict);
      assert.equal(repairs.length, constructs, `seed ${seed}: ${loose}`);
      assert.deepStrictEqual(toValue(ast), expected, `seed ${seed}`);
      for (const [indent] of INDENTS) {
        assert.deepStrictEqual(JSON.parse(format(ast, { indent })), expected, `seed ${seed}, indent ${indent}`);
      }
    }
  });

  it('repair into strict JSON with the same value, and repairing again changes nothing', () => {
    for (const { seed, strict, loose } of documents) {
      const result = repair(loose);
      assert.equal(result.ok, true, `seed ${seed}`);
      assert.deepStrictEqual(toValue(parse(result.text).ast), JSON.parse(strict), `seed ${seed}: ${result.text}`);
      assert.deepStrictEqual(repair(result.text).repairs, [], `seed ${seed}`);
    }
  });

  it('fail in strict mode at a relaxed construct, with the relaxed hint', () => {
    for (const { seed, loose, constructs } of documents) {
      const result = tryParse(loose);
      if (constructs === 0) {
        assert.equal(result.ok, true, `seed ${seed}`);
        continue;
      }
      const { repairs } = parse(loose, { relaxed: true });
      const message = `seed ${seed}: ${loose}`;
      assert.equal(result.ok, false, message);
      assert.equal(result.error.hint, 'relaxed', message);
      // The first construct, or a comment right after a trailing comma (only then is the comma known to trail).
      assert.ok(result.error.offset >= repairs[0].start, message);
      assert.ok(repairs.some((item) => item.start === result.error.offset), message);
      assert.deepStrictEqual(lineColumn(loose, result.error.offset), { line: result.error.line, column: result.error.column }, message);
    }
  });
});
