// Wraps chrome.storage.local. Tested in node by mocking globalThis.chrome.

const STORAGE_KEY = 'state';

const CHANGELOG = [
  {
    version: '0.4.1',
    date: '2026-04-12',
    changes: ['Initial release'],
    status: 'stable',
  },
];

export function getDefaultState() {
  return {
    schemaVersion: 2,
    appVersion: CHANGELOG[0].version,
    changelog: CHANGELOG,
    enabled: false,
    proxies: [],
    activeProxyIndex: -1,
    useTgProxy: false,
    presets: {
      gemini:     { enabled: true,  domains: ['gemini.google.com'] },
      aiStudio:   { enabled: true,  domains: ['aistudio.google.com', 'alkalimakersuite-pa.clients6.google.com'] },
      googleAuth: { enabled: true,  domains: ['accounts.google.com', 'ogs.google.com'] },
      notebookLM: { enabled: false, domains: ['notebooklm.google.com'] },
      googleLabs: { enabled: false, domains: ['labs.google', 'labs.google.com'] },
      chatgpt:    { enabled: false, domains: ['chatgpt.com', 'chat.openai.com'] },
      claude:     { enabled: false, domains: ['claude.ai'] },
      perplexity: { enabled: false, domains: ['perplexity.ai', 'www.perplexity.ai'] },
      grok:       { enabled: false, domains: ['grok.com', 'www.grok.com', 'x.ai'] },
      elevenlabs: { enabled: false, domains: ['elevenlabs.io', 'www.elevenlabs.io', 'api.elevenlabs.io'] },
      youtube:    { enabled: false, domains: ['youtube.com', 'www.youtube.com', 'youtu.be', 'googlevideo.com'] },
    },
    customDomains: [],
  };
}

export function createProxyEntry() {
  return {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    host: '',
    port: '',
    scheme: 'auto',
    user: '',
    pass: '',
    tgUrl: '',
    enabled: true,
    lastTest: null,
  };
}

export function parseTgProxyUrl(url) {
  if (!url || !url.startsWith('tg://')) return null;
  try {
    const params = new URL(url);
    return {
      server: params.searchParams.get('server'),
      port: params.searchParams.get('port'),
      secret: params.searchParams.get('secret'),
    };
  } catch {
    return null;
  }
}

export function getActiveProxy(state) {
  if (state.activeProxyIndex >= 0 && state.activeProxyIndex < state.proxies?.length) {
    return state.proxies[state.activeProxyIndex];
  }
  return state.proxies?.find(p => p.enabled) || null;
}

export function getNextWorkingProxy(state) {
  const proxies = state.proxies || [];
  if (proxies.length === 0) return null;
  
  let startIndex = state.activeProxyIndex >= 0 ? state.activeProxyIndex + 1 : 0;
  
  for (let i = 0; i < proxies.length; i++) {
    const idx = (startIndex + i) % proxies.length;
    const proxy = proxies[idx];
    if (proxy.enabled && proxy.lastTest?.ok) {
      return { proxy, index: idx };
    }
  }
  
  for (let i = 0; i < proxies.length; i++) {
    const idx = (startIndex + i) % proxies.length;
    if (proxies[idx].enabled) {
      return { proxy: proxies[idx], index: idx, untested: true };
    }
  }
  
  return null;
}

export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const saved = result[STORAGE_KEY];
  if (!saved) return getDefaultState();

  // Merge: add any new presets that didn't exist when the user first installed.
  const defaults = getDefaultState();
  for (const [key, def] of Object.entries(defaults.presets)) {
    if (!saved.presets[key]) {
      saved.presets[key] = def;
    }
  }
  return saved;
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function getCurrentVersion() {
  return CHANGELOG[0].version;
}

export function getChangelog() {
  return CHANGELOG;
}
