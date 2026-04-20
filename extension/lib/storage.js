// Wraps chrome.storage.local. Tested in node by mocking globalThis.chrome.

const STORAGE_KEY = 'state';

const CHANGELOG = [
  {
    version: '0.6.2',
    date: '2026-04-20',
    status: 'stable',
    features: [
      'Autonomous proxy search with automatic connection only when ping is below 2000 ms',
      'Immediate pruning of bad proxies during auto-search and health-based failover',
      'Favorites, favorite-only mode, and continue-from-next-proxy action',
      'Country proxy import from Proxifly and manual proxy list import from pasted text',
      'Saved proxy lists and favorite proxies export to local JSON files',
      'Debug log panel, localized toolbar tooltip, and ON/OFF/FND toolbar states',
    ],
    changesFromPrevious: [
      'Added: robust autonomous selection and periodic active-proxy health checks',
      'Added: favorites workflow, next-proxy resume, and favorites export',
      'Added: country list loading from GitHub and bulk proxy import from raw text',
      'Updated: in-extension documentation screen now reflects the current public feature set',
    ],
  },
  {
    version: '0.5.9',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Fixed addBtnText scope',
    ],
    changesFromPrevious: [
      'Fixed: addBtnText variable scope',
    ],
  },
  {
    version: '0.5.8',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Fix proxy index lookup',
    ],
    changesFromPrevious: [
      'Fixed: filter arrow function syntax',
    ],
  },
  {
    version: '0.5.7',
    date: '2026-04-17',
    status: 'stable',
    features: [
      ' RU translations',
      'Fix language switch rerender',
    ],
    changesFromPrevious: [
      'Added: RU translations for proxy fields',
      'Fixed: setLanguage() rerenders UI',
    ],
  },
  {
    version: '0.5.6',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Language switcher EN/RU',
    ],
    changesFromPrevious: [
      'Added: language buttons EN RU',
      'Added: translations object',
    ],
  },
  {
    version: '0.5.5',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Delete buttons',
      'Fix add buttons',
      'Sticky header',
    ],
    changesFromPrevious: [
      'Added: Delete button for each proxy',
      'Fixed: addProxyGroup and addTgProxyGroup',
      'Fixed: sticky header CSS',
    ],
  },
  {
    version: '0.5.4',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Multiple proxies with TEST ALL button',
      'Add button at bottom of each group',
      'Ping display per proxy',
      'Protocol selection per proxy',
    ],
    changesFromPrevious: [
      'Fixed: proxy add button works',
      'Fixed: TG proxy add works',
      'Added: TEST ALL tests all proxies',
      'Removed: TG toggle (auto-enabled)',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-04-17',
    status: 'stable',
    features: [
      'Multi-proxy support',
      'TG Proxy field',
      'Failover system',
      'Version info screen',
    ],
    changesFromPrevious: [
      'Added: multi-proxy support',
      'Added: TG proxy field',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-04-12',
    status: 'stable',
    features: [
      'Single proxy support',
      'HTTP/SOCKS protocols',
      'RKN compliance check',
      'AI services routing',
    ],
    changesFromPrevious: [],
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
    autoTestCursor: 0,
    autoSelecting: null,
    selectedCountryCode: null,
    favoriteOnly: false,
    pendingStartAfterIndex: null,
    lastAutoSelectIndex: null,
    useTgProxy: false,
    language: 'en',
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
    favorite: false,
    lastTest: null,
  };
}

export function parseTgProxyUrl(url) {
  if (!url) return null;
  
  try {
    let params;
    
    if (url.startsWith('tg://')) {
      params = new URL(url);
    } else if (url.includes('t.me/proxy') || url.includes('telegram')) {
      const match = url.match(/server=([^&]+)&port=([^&]+)&secret=([a-f0-9]+)/);
      if (match) {
        return {
          server: match[1],
          port: match[2],
          secret: match[3],
        };
      }
    } else if (url.includes('server=')) {
      const serverMatch = url.match(/server=([^&]+)/);
      const portMatch = url.match(/port=([^&]+)/);
      const secretMatch = url.match(/secret=([^&]+)/);
      if (serverMatch && portMatch && secretMatch) {
        return {
          server: serverMatch[1],
          port: portMatch[1],
          secret: secretMatch[1],
        };
      }
    }
    
    if (params) {
      return {
        server: params.searchParams.get('server'),
        port: params.searchParams.get('port'),
        secret: params.searchParams.get('secret'),
      };
    }
  } catch {
    return null;
  }
  
  return {
    server: '',
    port: '',
    secret: '',
  };
}

export function getActiveProxy(state) {
  if (state.activeProxyIndex >= 0 && state.activeProxyIndex < state.proxies?.length) {
    return state.proxies[state.activeProxyIndex];
  }
  return state.proxies?.find(p => p.enabled) || null;
}

export function getNextWorkingProxy(state) {
  return getBestProxy(state, false);
}

export function getBestProxy(state, checkLatency = true) {
  const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
  if (proxies.length === 0) return null;
  
  let bestProxy = null;
  let bestLatency = Infinity;
  let bestIndex = -1;
  
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    if (!proxy.enabled) continue;
    
    if (checkLatency && proxy.lastTest?.ok && proxy.lastTest.latencyMs > 0) {
      if (proxy.lastTest.latencyMs < bestLatency) {
        bestLatency = proxy.lastTest.latencyMs;
        bestProxy = proxy;
        bestIndex = i;
      }
    } else if (!checkLatency && proxy.lastTest?.ok) {
      if (!bestProxy || proxy.lastTest.latencyMs < bestLatency) {
        bestLatency = proxy.lastTest.latencyMs;
        bestProxy = proxy;
        bestIndex = i;
      }
    }
  }
  
  if (bestProxy && bestIndex >= 0) {
    return { proxy: bestProxy, index: bestIndex, latency: bestLatency };
  }
  
  return null;
}

export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const saved = result[STORAGE_KEY];
  if (!saved) return getDefaultState();

  // Merge: add any new presets that didn't exist when the user first installed.
  const defaults = getDefaultState();
  if (typeof saved.autoTestCursor !== 'number' || Number.isNaN(saved.autoTestCursor)) {
    saved.autoTestCursor = defaults.autoTestCursor;
  }
  if (!Object.prototype.hasOwnProperty.call(saved, 'autoSelecting')) {
    saved.autoSelecting = defaults.autoSelecting;
  }
  if (!Object.prototype.hasOwnProperty.call(saved, 'selectedCountryCode')) {
    saved.selectedCountryCode = defaults.selectedCountryCode;
  }
  if (!Object.prototype.hasOwnProperty.call(saved, 'favoriteOnly')) {
    saved.favoriteOnly = defaults.favoriteOnly;
  }
  if (!Object.prototype.hasOwnProperty.call(saved, 'pendingStartAfterIndex')) {
    saved.pendingStartAfterIndex = defaults.pendingStartAfterIndex;
  }
  if (!Object.prototype.hasOwnProperty.call(saved, 'lastAutoSelectIndex')) {
    saved.lastAutoSelectIndex = defaults.lastAutoSelectIndex;
  }
  if (Array.isArray(saved.proxies)) {
    saved.proxies = saved.proxies.map((proxy) => ({
      ...proxy,
      favorite: proxy?.favorite === true,
    }));
  }
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
