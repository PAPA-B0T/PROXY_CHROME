import { test } from 'node:test';
import assert from 'node:assert/strict';

let mockStore = {};
globalThis.chrome = {
  storage: {
    local: {
      get: (key) => Promise.resolve(key in mockStore ? { [key]: mockStore[key] } : {}),
      set: (obj) => { Object.assign(mockStore, obj); return Promise.resolve(); },
      clear: () => { mockStore = {}; return Promise.resolve(); },
    },
  },
};

const { loadState, saveState, getDefaultState, createProxyEntry } = await import('../proxy_extension/lib/storage.js');

test('getDefaultState: schemaVersion is 2', () => {
  assert.equal(getDefaultState().schemaVersion, 2);
});

test('getDefaultState: enabled is false', () => {
  assert.equal(getDefaultState().enabled, false);
});

test('getDefaultState: includes empty proxies array', () => {
  const state = getDefaultState();
  assert.equal(Array.isArray(state.proxies), true);
  assert.equal(state.proxies.length, 0);
});

test('createProxyEntry: has no tgUrl field', () => {
  const proxy = createProxyEntry();
  assert.equal('tgUrl' in proxy, false);
});

test('loadState: returns default state when storage empty', async () => {
  await chrome.storage.local.clear();
  const state = await loadState();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.enabled, false);
  assert.equal(state.proxies.length, 0);
});

test('loadState/saveState: round-trip preserves TG-free proxy data', async () => {
  await chrome.storage.local.clear();
  const original = getDefaultState();
  original.enabled = true;
  original.proxies = [{
    id: 'proxy-1',
    host: '1.2.3.4',
    port: 1080,
    scheme: 'http',
    user: 'u',
    pass: 'p',
    enabled: true,
    lastTest: null,
  }];
  await saveState(original);
  const loaded = await loadState();
  assert.deepEqual(loaded, original);
});
