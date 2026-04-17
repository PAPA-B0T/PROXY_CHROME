// Wraps chrome.proxy.settings.set/clear and chrome.webRequest.onAuthRequired.
// Listener registration is at the top level so it survives service-worker
// sleep — see spec §17.

import { loadState, getActiveProxy } from './storage.js';
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

    const res = await fetch('https://ipinfo.io/json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      ok: true,
      ip: data.ip,
      country: data.country,
      latencyMs: Date.now(),
      at: Math.floor(Date.now() / 1000),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
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
