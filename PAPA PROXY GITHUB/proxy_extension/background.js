// Service worker entry. Registers listeners at top level so they survive
// sleep/wake. On startup: load state, push PAC, set initial icon for the
// active tab.

import { loadState, saveState, getActiveProxy, getBestProxy, getNextWorkingProxy, parseTgProxyUrl } from './lib/storage.js';
import { applyProxy, registerAuthListener, testProxy } from './lib/proxy.js';
import { setIconState } from './lib/icon.js';
import { buildPacScript } from './lib/pac.js';
import { checkAllPresets, isCheckDue, checkDomain } from './lib/rkn-check.js';
import { log, LOG_ACTIONS } from './lib/logger.js';

let autoSelectSessionId = 0;
let autoSelectPromise = null;

// 1. Auth listener — must be top-level for sleep/wake survival.
registerAuthListener();

// 2. Storage change → re-apply PAC and refresh icons.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.state) return;
  const state = changes.state.newValue;
  const wasEnabled = !!changes.state.oldValue?.enabled;
  const isEnabled = !!state?.enabled;

  if (!isEnabled) {
    cancelAutoSelection('disabled');
    await applyProxy(state);
  } else if (isEnabled && !wasEnabled) {
    const freshState = await loadState();
    await ensureActiveProxyReady(freshState, 'storage-enable');
  } else if (state?.autoSelecting?.running) {
    // During autonomous search we persist many intermediate probe states.
    // Do not push the normal PAC from those transient states, otherwise the
    // extension can temporarily route through an untested proxy.
  } else {
    await applyProxy(state);
  }
  const latestState = await loadState();
  await refreshActiveTabIcon(latestState);
});

// 3. Tab activation → refresh icon for newly-active tab.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const state = await loadState();
  await refreshTabIcon(tabId, state);
});

// 4. Tab navigation completed → refresh icon (URL may have changed).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.status && !changeInfo.url) return;
  const state = await loadState();
  await refreshTabIcon(tabId, state, tab);
});

// 5. Boot/wake + RKN compliance check.
(async function boot() {
  const state = await loadState();
  log(LOG_ACTIONS.APP_STARTED, { version: state.appVersion, proxiesCount: state.proxies?.length || 0 });
  if (state.enabled) {
    await ensureActiveProxyReady(state, 'boot');
  } else {
    await applyProxy(state);
  }
  await refreshActiveTabIcon(state);
  await maybeRunRknCheck(state);
})();

export async function activateWithBestProxy() {
  const state = await loadState();
  if (!state.enabled || !state.proxies?.length) return;
  await ensureActiveProxyReady(state, 'activate');
}

// 6. Periodic RKN check — runs on chrome.alarms every 24h.
chrome.alarms.create('rkn-check', { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'rkn-check') return;
  const state = await loadState();
  await runRknCheck(state);
});

// 7. Proxy health check + failover. Chrome alarms in installed extensions
// are limited to 30s minimum, so we use 0.5 minutes.
chrome.alarms.create('proxy-health', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'proxy-health') return;
  const state = await loadState();
  if (!state.enabled) return;
  await checkProxyHealth(state);
});

const MAX_PING_MS = 2000;

function getValidLatencyMs(result) {
  const value = Number(result?.latencyMs);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code || null;
}

function shouldRemoveAfterAutoSelect(result) {
  if (!result?.ok) return true;
  const latencyMs = getValidLatencyMs(result);
  return latencyMs === null || latencyMs >= MAX_PING_MS;
}

function getSelectableCandidates(state) {
  const proxies = state.proxies || [];
  const base = proxies
    .map((proxy, index) => ({ proxy, index }))
    .filter(({ proxy }) => !proxy?.tgUrl && proxy?.enabled && proxy?.host && proxy?.port);

  if (!state?.favoriteOnly) {
    return base;
  }

  return base.filter(({ proxy }) => proxy?.favorite === true);
}

function orderCandidatesFromIndex(candidates, startAfterIndex = null) {
  if (!candidates.length) return [];
  if (!Number.isInteger(startAfterIndex)) return candidates;

  const currentPos = candidates.findIndex((item) => item.index === startAfterIndex);
  if (currentPos === -1) {
    return candidates;
  }

  return candidates.slice(currentPos + 1).concat(candidates.slice(0, currentPos + 1));
}

function removeProxyAtIndex(state, index, keepIndex = null) {
  if (!Number.isInteger(index) || index < 0 || index >= (state.proxies?.length || 0)) {
    return { keptIndex: keepIndex, removed: false };
  }

  state.proxies.splice(index, 1);

  let keptIndexNext = keepIndex;
  if (Number.isInteger(keptIndexNext) && index < keptIndexNext) {
    keptIndexNext -= 1;
  } else if (keptIndexNext === index) {
    keptIndexNext = null;
  }

  if (Number.isInteger(state.activeProxyIndex)) {
    if (index < state.activeProxyIndex) {
      state.activeProxyIndex -= 1;
    } else if (index === state.activeProxyIndex) {
      state.activeProxyIndex = -1;
    }
  }

  if (Number.isInteger(state.lastAutoSelectIndex)) {
    if (index < state.lastAutoSelectIndex) {
      state.lastAutoSelectIndex -= 1;
    } else if (index === state.lastAutoSelectIndex) {
      state.lastAutoSelectIndex = Math.max(0, index - 1);
      if (!state.proxies.length) {
        state.lastAutoSelectIndex = null;
      }
    }
  }

  if (!state.proxies.length) {
    state.activeProxyIndex = -1;
    state.proxy = null;
    state.autoTestCursor = 0;
    return { keptIndex: -1, removed: true };
  }

  if (!Number.isInteger(state.activeProxyIndex) || state.activeProxyIndex < 0 || state.activeProxyIndex >= state.proxies.length) {
    state.activeProxyIndex = state.proxies.findIndex((proxy) => !proxy?.tgUrl && proxy?.enabled && proxy?.host && proxy?.port);
  }

  state.proxy = Number.isInteger(keptIndexNext) && keptIndexNext >= 0
    ? state.proxies[keptIndexNext] || null
    : (state.activeProxyIndex >= 0 ? state.proxies[state.activeProxyIndex] || null : null);

  return { keptIndex: keptIndexNext, removed: true };
}

function purgeRejectedAutoSelectProxies(state, rejectedIndices, keepIndex = null) {
  const unique = [...new Set((rejectedIndices || []).filter((index) => Number.isInteger(index)))].sort((a, b) => a - b);
  if (!unique.length) {
    return { keptIndex: keepIndex, removedCount: 0 };
  }

  let keptIndex = keepIndex;
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const index = unique[i];
    if (index < 0 || index >= (state.proxies?.length || 0)) continue;
    state.proxies.splice(index, 1);
    if (Number.isInteger(keptIndex) && index < keptIndex) {
      keptIndex -= 1;
    }
  }

  if (!state.proxies.length) {
    state.activeProxyIndex = -1;
    state.proxy = null;
    state.autoTestCursor = 0;
    return { keptIndex: -1, removedCount: unique.length };
  }

  if (Number.isInteger(state.activeProxyIndex)) {
    const removedBeforeActive = unique.filter((index) => index < state.activeProxyIndex).length;
    if (unique.includes(state.activeProxyIndex)) {
      state.activeProxyIndex = Math.min(state.activeProxyIndex - removedBeforeActive, state.proxies.length - 1);
    } else {
      state.activeProxyIndex -= removedBeforeActive;
    }
  }

  if (!Number.isInteger(state.activeProxyIndex) || state.activeProxyIndex < 0 || state.activeProxyIndex >= state.proxies.length) {
    state.activeProxyIndex = state.proxies.findIndex((proxy) => !proxy?.tgUrl && proxy?.enabled && proxy?.host && proxy?.port);
  }

  state.proxy = Number.isInteger(keptIndex) && keptIndex >= 0
    ? state.proxies[keptIndex] || null
    : (state.activeProxyIndex >= 0 ? state.proxies[state.activeProxyIndex] || null : null);

  const firstCandidateIndex = state.proxies.findIndex((proxy) => !proxy?.tgUrl && proxy?.enabled && proxy?.host && proxy?.port);
  if (firstCandidateIndex >= 0) {
    state.autoTestCursor = 0;
  } else {
    state.autoTestCursor = 0;
  }

  return { keptIndex, removedCount: unique.length };
}

async function checkProxyHealth(state) {
  if (!(await hasAnyRoutedTabs(state))) {
    return;
  }

  const currentProxy = getActiveProxy(state);
  if (!currentProxy) return;

  const testResult = await testProxy(currentProxy);
  currentProxy.lastTest = testResult;
  if (state.proxy && state.proxy.host === currentProxy.host && state.proxy.port === currentProxy.port) {
    state.proxy.lastTest = testResult;
  }
  await saveState(state);

  if (testResult.ok) {
    log(LOG_ACTIONS.PROXY_TESTED, {
      stage: 'health-check-current',
      host: currentProxy.host,
      port: currentProxy.port,
      latency: testResult.latencyMs,
      country: testResult.country,
    });
  } else {
    log(LOG_ACTIONS.CONNECTION_ERROR, {
      stage: 'health-check-current',
      host: currentProxy.host,
      port: currentProxy.port,
      error: testResult.error,
    });
  }

  const currentPing = getValidLatencyMs(testResult) || 0;
  const needsSwitch = !testResult?.ok || currentPing >= MAX_PING_MS;

  if (needsSwitch) {
    log(LOG_ACTIONS.FAILOVER_START, { currentProxy: `${currentProxy.host}:${currentProxy.port}`, currentPing, maxPing: MAX_PING_MS });
    await ensureActiveProxyReady(state, 'health-check');
  }
}

async function ensureActiveProxyReady(state, reason) {
  if (!state?.enabled) {
    cancelAutoSelection('ensure-disabled');
    return null;
  }

  const candidates = getSelectableCandidates(state);
  if (!candidates.length) {
    await updateAutoSelecting(state, { running: false, reason, stage: 'no-enabled-proxies' });
    log(LOG_ACTIONS.FAILOVER_FAILED, { reason, stage: 'no-enabled-proxies' });
    await applyProxy(state);
    return null;
  }

  const best = getBestProxy(state, true);
  if (
    best
    && getValidLatencyMs(best.proxy?.lastTest) !== null
    && best.latency < MAX_PING_MS
  ) {
    state.proxy = state.proxies[best.index] || null;
    state.autoSelecting = null;
    cancelAutoSelection('best-tested-selected');
    if (state.activeProxyIndex !== best.index) {
      state.activeProxyIndex = best.index;
      state.autoTestCursor = 0;
      await saveState(state);
      log(LOG_ACTIONS.FAILOVER_SWITCH, {
        reason,
        stage: 'best-tested-selected',
        toIndex: best.index,
        latency: best.latency,
      });
    }
    state.autoTestCursor = 0;
    await applyProxy(state);
    return best;
  }

  if (autoSelectPromise) {
    return await autoSelectPromise;
  }

  autoSelectPromise = autoSelectProxy(state, reason, ++autoSelectSessionId);
  const selected = await autoSelectPromise;
  autoSelectPromise = null;
  if (selected) return selected;

  cancelAutoSelection('auto-select-exhausted');
  state.autoSelecting = null;
  state.enabled = false;
  state.activeProxyIndex = -1;
  state.proxy = null;
  await saveState(state);
  await applyProxy(state);
  log(LOG_ACTIONS.FAILOVER_ALL_FAILED, { reason, stage: 'auto-select-exhausted' });
  return null;
}

async function autoSelectProxy(state, reason, sessionId) {
  const candidates = getSelectableCandidates(state);

  if (!candidates.length) {
    await updateAutoSelecting(state, { running: false, reason, stage: 'auto-select-no-candidates' });
    log(LOG_ACTIONS.FAILOVER_FAILED, { reason, stage: 'auto-select-no-candidates' });
    return null;
  }

  const startAfterIndex = Number.isInteger(state.pendingStartAfterIndex) ? state.pendingStartAfterIndex : null;
  const orderedIds = orderCandidatesFromIndex(candidates, startAfterIndex).map((item) => item.proxy.id);
  state.pendingStartAfterIndex = null;
  await updateAutoSelecting(state, {
    running: true,
    reason,
    stage: 'start',
    cursor: startAfterIndex ?? 0,
    candidates: orderedIds,
  });
  log(LOG_ACTIONS.FAILOVER_START, {
    reason,
    stage: 'auto-select-start',
    cursor: startAfterIndex ?? 0,
    candidates: orderedIds,
    maxPing: MAX_PING_MS,
    favoriteOnly: !!state.favoriteOnly,
  });

  for (const proxyId of orderedIds) {
    if (!(await isAutoSelectionStillValid(sessionId))) {
      return null;
    }

    const liveIndex = (state.proxies || []).findIndex((proxy) => proxy?.id === proxyId);
    if (liveIndex === -1) continue;

    const proxy = state.proxies[liveIndex];
    if (!proxy?.enabled || !proxy.host || !proxy.port || proxy.tgUrl) continue;

    await updateAutoSelecting(state, {
      running: true,
      reason,
      stage: 'probing',
      index: liveIndex,
      host: proxy.host,
      port: proxy.port,
    });
    state.lastAutoSelectIndex = liveIndex;
    proxy.lastTest = { pending: true, at: Math.floor(Date.now() / 1000), source: 'auto-select' };
    state.proxy = proxy;
    await saveState(state);

    log(LOG_ACTIONS.PROXY_TESTED, {
      reason,
      stage: 'auto-select-probe-start',
      index: liveIndex,
      host: proxy.host,
      port: proxy.port,
    });

    const result = await testProxy(proxy);
    if (!(await isAutoSelectionStillValid(sessionId))) {
      return null;
    }
    proxy.lastTest = result;
    state.proxy = proxy;
    state.proxy.lastTest = result;
    state.autoTestCursor = 0;
    const latencyMs = getValidLatencyMs(result);

    if (result.ok) {
      log(LOG_ACTIONS.CONNECTION_OK, {
        reason,
        stage: 'auto-select-probe-ok',
        index: liveIndex,
        host: proxy.host,
        port: proxy.port,
        latency: latencyMs,
        country: result.country,
      });
    } else {
      log(LOG_ACTIONS.CONNECTION_ERROR, {
        reason,
        stage: 'auto-select-probe-failed',
        index: liveIndex,
        host: proxy.host,
        port: proxy.port,
        error: result.error,
      });
    }

    if (result.ok && latencyMs !== null && latencyMs < MAX_PING_MS) {
      state.activeProxyIndex = liveIndex;
      state.proxy = state.proxies[state.activeProxyIndex] || null;
      if (state.proxy) {
        state.proxy.lastTest = result;
      }
      state.autoSelecting = null;
      cancelAutoSelection('auto-select-success');
      await saveState(state);
      await applyProxy(state);
      log(LOG_ACTIONS.FAILOVER_SWITCH, {
        reason,
        stage: 'auto-select-success',
        toIndex: liveIndex,
        latency: latencyMs,
      });
      return { proxy: state.proxy, index: state.activeProxyIndex, latency: latencyMs };
    }

    if (shouldRemoveAfterAutoSelect(result)) {
      log(LOG_ACTIONS.PROXY_REMOVED, {
        reason,
        stage: 'auto-select-pruned',
        index: liveIndex,
        host: proxy.host,
        port: proxy.port,
        latency: latencyMs,
        error: result.error || null,
      });
      removeProxyAtIndex(state, liveIndex);
      await saveState(state);
    }
  }

  await saveState(state);
  await updateAutoSelecting(state, { running: false, reason, stage: 'exhausted' });
  return null;
}

async function updateAutoSelecting(state, payload) {
  state.autoSelecting = payload?.running
    ? {
        running: true,
        at: Date.now(),
        ...payload,
      }
    : null;
  await saveState(state);
}

function cancelAutoSelection(reason) {
  autoSelectSessionId += 1;
  autoSelectPromise = null;
  log(LOG_ACTIONS.FAILOVER_FAILED, { reason, stage: 'auto-select-cancelled' });
}

async function isAutoSelectionStillValid(sessionId) {
  if (sessionId !== autoSelectSessionId) {
    return false;
  }
  const latest = await loadState();
  return !!latest?.enabled && sessionId === autoSelectSessionId;
}

async function maybeRunRknCheck(state) {
  if (!isCheckDue(state.rknLastCheckAt)) return;
  await runRknCheck(state);
}

async function runRknCheck(state) {
  const results = await checkAllPresets(state.presets || {});
  state.rknResults = results;
  state.rknLastCheckAt = Date.now();

  // Disable presets whose domains are RKN-blocked.
  let changed = false;
  for (const [_key, preset] of Object.entries(state.presets || {})) {
    const blocked = (preset.domains || []).some((d) => results[d]?.blocked);
    if (blocked && preset.enabled) {
      preset.enabled = false;
      changed = true;
    }
  }

  await saveState(state);
  if (changed) await applyProxy(state);
}

// --- helpers --------------------------------------------------------------

async function refreshActiveTabIcon(state) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await refreshTabIcon(tab.id, state, tab);
}

async function refreshTabIcon(tabId, state, tabHint = null) {
  if (!state || !state.enabled) {
    await setIconState(tabId, 'off', { language: state?.language });
    return;
  }
  if (state.autoSelecting?.running) {
    await setIconState(tabId, 'searching', {
      language: state.language,
      host: state.autoSelecting.host,
      index: state.autoSelecting.index,
    });
    return;
  }
  if (!state.proxy || !state.proxy.host) {
    await setIconState(tabId, 'error', { reason: state.language === 'ru' ? 'не настроен' : 'not configured', language: state.language });
    return;
  }

  const tab = tabHint || await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    await setIconState(tabId, 'direct', { host: state.language === 'ru' ? '(загрузка)' : '(loading)', language: state.language });
    return;
  }

  const host = new URL(tab.url).hostname;
  const isRouted = isHostRouted(host, state);
  if (isRouted) {
    await setIconState(tabId, 'routed', {
      language: state.language,
      host,
      country: state.proxy.lastTest?.country,
      latencyMs: state.proxy.lastTest?.latencyMs,
    });
  } else {
    await setIconState(tabId, 'direct', { host, language: state.language });
  }
}

async function hasAnyRoutedTabs(state) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab?.url || !tab.url.startsWith('http')) continue;
    try {
      const host = new URL(tab.url).hostname;
      if (isHostRouted(host, state)) {
        return true;
      }
    } catch {
      // Ignore malformed or internal URLs.
    }
  }
  return false;
}

// Mirror of pac.js routing logic for icon state checks. Kept tiny on purpose.
function isHostRouted(host, state) {
  const pac = buildPacScript(state);
  if (!pac) return false;
  const presets = state.presets || {};
  const aiOn = ['gemini', 'aiStudio', 'notebookLM'].some((k) => presets[k]?.enabled);
  for (const [key, p] of Object.entries(presets)) {
    if (!p.enabled && !(key === 'googleAuth' && aiOn)) continue;
    for (const d of p.domains || []) {
      if (host === d || host.endsWith('.' + d)) return true;
    }
  }
  for (const e of state.customDomains || []) {
    const v = e.value;
    if (e.mode === 'wildcard') {
      if (host !== v && host.endsWith('.' + v)) return true;
    } else if (e.mode === 'exact') {
      if (host === v) return true;
    } else {
      if (host === v || host.endsWith('.' + v)) return true;
    }
  }
  return false;
}

// --- popup messaging ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'START_AUTO_SELECT') {
    (async () => {
      const state = await loadState();
      if (!state?.enabled) {
        sendResponse({ ok: false, reason: 'disabled' });
        return;
      }
      const selected = await ensureActiveProxyReady(state, msg.reason || 'popup-start');
      sendResponse({ ok: !!selected });
    })();
    return true;
  }
  if (msg?.type === 'TEST_PROXY') {
    runProxyTest('https://ipinfo.io/json').then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'TEST_GEMINI') {
    runProxyTest('https://gemini.google.com/').then(sendResponse);
    return true;
  }
  if (msg?.type === 'DETECT_SCHEME') {
    // Fire-and-forget: run detection in background, write result to storage.
    // Popup watches storage changes to update UI.
    detectScheme(msg.host, msg.port, msg.user, msg.pass);
    sendResponse({ started: true });
    return false;
  }
  if (msg?.type === 'CHECK_DOMAIN') {
    checkDomain(msg.domain)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ blocked: false, reason: `error: ${err.message}` }));
    return true;
  }
  if (msg?.type === 'RKN_CHECK') {
    (async () => {
      const st = await loadState();
      await runRknCheck(st);
      sendResponse(st.rknResults || {});
    })();
    return true;
  }
});

async function runProxyTest(url) {
  const state = await loadState();
  if (!state.proxy?.host) return { ok: false, error: 'No proxy configured' };

  // Temporarily route ALL traffic through the proxy so the test URL actually
  // goes through it (ipinfo.io is not in the normal routing list).
  await chrome.proxy.settings.set({
    value: {
      mode: 'pac_script',
      pacScript: { data: buildAllThroughPac(state.proxy), mandatory: true },
    },
    scope: 'regular',
  });

  const start = Date.now();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    let extra = {};
    if (url.includes('ipinfo.io')) {
      const data = await res.json();
      extra = { ip: data.ip, country: data.country };
      state.proxy.lastTest = {
        ok: true,
        ip: data.ip,
        country: data.country,
        latencyMs,
        at: Math.floor(Date.now() / 1000),
      };
      await saveState(state);
    } else {
      extra = { httpStatus: res.status };
    }
    return { ok: true, latencyMs, ...extra };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    // Restore normal PAC (routes only configured domains).
    await applyProxy(state);
  }
}

// Build a PAC that routes every URL through the proxy (used only for testing).
function buildAllThroughPac(proxy) {
  const { scheme, host, port } = proxy;
  let directive;
  switch (scheme) {
    case 'https':  directive = `HTTPS ${host}:${port}`; break;
    case 'socks5': directive = `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}`; break;
    case 'socks4': directive = `SOCKS ${host}:${port}`; break;
    default:       directive = `PROXY ${host}:${port}`;
  }
  return `function FindProxyForURL(url, host) { return "${directive}"; }`;
}

// Auto-detect which protocol the proxy speaks.
// Writes progress to state.detectStatus so the popup reacts via storage listener.
async function detectScheme(host, port, user, pass) {
  const candidates = ['http', 'socks5', 'socks4', 'https'];
  const state = await loadState();
  const origProxy = state.proxy;

  state.proxy = { host, port: Number(port), scheme: 'auto', user: user || '', pass: pass || '' };
  state.detectStatus = { running: true, trying: candidates[0] };
  await saveState(state);
  await new Promise((r) => setTimeout(r, 100));

  for (const scheme of candidates) {
    // Write current attempt so popup can show it live.
    state.detectStatus = { running: true, trying: scheme };
    await saveState(state);

    try {
      const pac = buildAllThroughPac({ scheme, host, port: Number(port) });
      await chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
        scope: 'regular',
      });
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch('https://ipinfo.io/json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        state.proxy.scheme = scheme;
        state.detectStatus = { running: false, ok: true, scheme };
        await saveState(state);
        await applyProxy(state);
        return;
      }
    } catch {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  state.proxy = origProxy;
  state.detectStatus = { running: false, ok: false, error: 'Could not detect protocol' };
  await saveState(state);
  if (origProxy) await applyProxy(state);
}
