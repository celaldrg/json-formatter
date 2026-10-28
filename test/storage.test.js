import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStorage, storage } from '../src/storage.js';

/** A Web Storage stand-in that keeps strings in a Map, like localStorage does. */
function memoryBackend() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

const failing = (message) => () => {
  throw new Error(message);
};

describe('createStorage', () => {
  it('stores strings under the app prefix', () => {
    const backend = memoryBackend();
    const store = createStorage(() => backend);
    assert.equal(store.set('lang', 'tr'), true);
    assert.equal(store.set('indent', 4), true);
    assert.deepStrictEqual([...backend.items], [['json-formatter:lang', 'tr'], ['json-formatter:indent', '4']]);
    assert.deepStrictEqual([store.get('lang'), store.get('indent')], ['tr', '4']);
  });

  it('returns the fallback only for missing keys', () => {
    const store = createStorage(() => memoryBackend());
    assert.equal(store.get('missing'), null);
    assert.equal(store.get('missing', 'en'), 'en');
    const backend = memoryBackend();
    const kept = createStorage(() => backend);
    kept.set('query', '');
    assert.equal(kept.get('query', '$'), '');
  });

  it('never throws when storage is blocked or full', () => {
    const store = createStorage(() => ({ getItem: failing('SecurityError'), setItem: failing('QuotaExceededError') }));
    assert.equal(store.get('lang', 'en'), 'en');
    assert.equal(store.set('lang', 'tr'), false);
  });

  it('copes with a missing backend and with a lookup that throws', () => {
    for (const getBackend of [() => undefined, () => null, failing('denied')]) {
      const store = createStorage(getBackend);
      assert.equal(store.get('a', 'x'), 'x');
      assert.equal(store.set('a', 'b'), false);
    }
  });

  it('looks the backend up on every call, never when it is created', () => {
    let lookups = 0;
    const backend = memoryBackend();
    const store = createStorage(() => {
      lookups += 1;
      return backend;
    });
    assert.equal(lookups, 0);
    store.set('a', '1');
    assert.equal(store.get('a'), '1');
    assert.equal(lookups, 2);
  });

  it('exports the store the app uses', () => {
    assert.deepStrictEqual([typeof storage.get, typeof storage.set], ['function', 'function']);
  });
});
