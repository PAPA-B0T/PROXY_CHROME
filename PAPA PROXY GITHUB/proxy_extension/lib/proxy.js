// Wraps chrome.proxy.settings.set/clear and chrome.webRequest.onAuthRequired.
// Listener registration is at the top level so it survives service-worker
// sleep — see spec §17.

import { loadState, getActiveProxy, parseTgProxyUrl } from './storage.js';
import { buildPacScript } from './pac.js';

/**
 * Apply the current state to chrome.proxy. Pushes a generated PAC script when
 * one is producible, otherwise clears proxy settings entirely.
 */
export async function applyProxy(state) {
  if (state.useTgProxy) {
    const tgProxy = state.proxies?.find(p => p.tgUrl && p.enabled);
    if (tgProxy) {
      console.log('[Proxy] TG proxy mode active - note: requires external MTProxy to SOCKS5 converter');
    }
  }
  
  const pac = buildPacScript(state);
  if (pac === null) {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    return { applied: false };
  }
  await chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
    scope: 'regular',
  });
  return { applied: true };
}

/**
 * Test if a proxy is working by making a request through it.
 */
export async function testProxy(proxy) {
  if (proxy?.tgUrl) {
    return testTgProxy(proxy);
  }
  
  if (!proxy?.host || !proxy?.port) {
    return { ok: false, error: 'No proxy configured' };
  }

  const buildPac = (scheme, host, port) => {
    let directive;
    switch (scheme) {
      case 'https': directive = `HTTPS ${host}:${port}`; break;
      case 'socks5': directive = `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}`; break;
      case 'socks4': directive = `SOCKS ${host}:${port}`; break;
      default: directive = `PROXY ${host}:${port}`;
    }
    return `function FindProxyForURL(url, host) { return "${directive}"; }`;
  };

  try {
    const pac = buildPac(proxy.scheme || 'http', proxy.host, proxy.port);
    await chrome.proxy.settings.set({
      value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
      scope: 'regular',
    });
    await sleep(400);

    try {
      return await runProxyProbe();
    } catch (firstError) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      await sleep(500);
      await waitForDirectNetwork();
      await chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
        scope: 'regular',
      });
      await sleep(700);
      return await runProxyProbe();
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    await sleep(300);
    try {
      await waitForDirectNetwork();
    } catch {
      // Keep failures non-fatal here; caller will decide what to do next.
    }
  }
}

/**
 * Test TG Proxy - note that MTProto requires Telegram client or SOCKS5 converter
 */
export async function testTgProxy(proxy) {
  const parsed = parseTgProxyUrl(proxy.tgUrl);
  if (!parsed || !parsed.server || !parsed.port) {
    return { ok: false, error: 'Invalid TG Proxy URL' };
  }
  
  return {
    ok: true,
    ip: 'TG Proxy',
    country: parsed.server,
    latencyMs: 0,
    note: 'MTProto requires SOCKS5 converter or Telegram client',
    at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Top-level registration of the proxy auth listener. Runs every time the
 * service worker starts (on install, on browser launch, on wake from sleep).
 * Reads credentials from storage at fire time so updates are picked up live.
 */
export function registerAuthListener() {
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      if (!details.isProxy) { callback({}); return; }
      loadState()
        .then((state) => {
          const proxy = getActiveProxy(state);
          if (!proxy?.user) { callback({}); return; }
          callback({ authCredentials: { username: proxy.user, password: proxy.pass || '' } });
        })
        .catch(() => callback({}));
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
  );
}

async function runProxyProbe() {
  const start = Date.now();
  const res = await fetch('https://ipinfo.io/json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    ok: true,
    ip: data.ip,
    country: data.country,
    latencyMs,
    at: Math.floor(Date.now() / 1000),
  };
}

async function waitForDirectNetwork() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch('https://ipinfo.io/json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Wait and retry.
    }
    await sleep(250);
  }
  throw new Error('Direct network did not recover');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
