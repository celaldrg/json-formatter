/**
 * The only place that touches localStorage. Every access is wrapped in try/catch, so private
 * browsing, disabled storage or a full quota never break the app; values are plain strings.
 */

const PREFIX = 'json-formatter:';

/**
 * Creates a string store on top of a Web Storage-like backend, which is looked up on every
 * call (never at import time).
 * @param {() => (Pick<Storage, 'getItem'|'setItem'>|undefined)} [getBackend]
 * @returns {{get: (key: string, fallback?: string|null) => string|null, set: (key: string, value: string) => boolean}}
 */
export function createStorage(getBackend = () => globalThis.localStorage) {
  return {
    get(key, fallback = null) {
      try {
        return getBackend().getItem(PREFIX + key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        getBackend().setItem(PREFIX + key, String(value));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The app's store, backed by the browser's localStorage. */
export const storage = createStorage();
