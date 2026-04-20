// Pure module — no chrome.* APIs allowed.

const AI_PRESET_KEYS = ['gemini', 'aiStudio', 'notebookLM'];

function parseTgProxyUrlSimple(url) {
  if (!url) return null;
  try {
    if (url.startsWith('tg://')) {
      const params = new URL(url);
      return {
        server: params.searchParams.get('server'),
        port: params.searchParams.get('port'),
        secret: params.searchParams.get('secret'),
      };
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
  } catch {}
  return null;
}

function pacDirective(scheme, host, port) {
  switch (scheme) {
    case 'http':   return `PROXY ${host}:${port}`;
    case 'https':  return `HTTPS ${host}:${port}`;
    case 'socks5': return `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}`;
    case 'socks4': return `SOCKS ${host}:${port}`;
    case 'auto':   return `PROXY ${host}:${port}`;
    default:       throw new Error(`Unknown proxy scheme: ${scheme}`);
  }
}

function collectDomains(state) {
  const suffixes = [];
  const wildcards = [];
  const exacts = [];

  const presets = state.presets || {};
  const anyAiEnabled = AI_PRESET_KEYS.some((k) => presets[k]?.enabled);

  for (const [key, preset] of Object.entries(presets)) {
    const isCoupledGoogleAuth = key === 'googleAuth' && anyAiEnabled;
    if (!preset.enabled && !isCoupledGoogleAuth) continue;
    for (const d of preset.domains || []) suffixes.push(d);
  }

  for (const entry of state.customDomains || []) {
    if (!entry || !entry.value) continue;
    if (entry.mode === 'wildcard') wildcards.push(entry.value);
    else if (entry.mode === 'exact') exacts.push(entry.value);
    else suffixes.push(entry.value);
  }

  return { suffixes, wildcards, exacts };
}

/**
 * Build a PAC script string from extension state. Returns null if the extension
 * is disabled or no proxy is configured — the caller should clear chrome.proxy
 * settings in that case.
 *
 * The script does NOT include a "; DIRECT" fallback after the proxy directive.
 * If the proxy fails, the request fails — never silently leak through the user's
 * real IP. See spec §13.
 */
export function buildPacScript(state) {
  if (!state || !state.enabled) return null;

  if (state.useTgProxy && state.proxies?.some(p => p.tgUrl && p.enabled)) {
    const tgProxy = state.proxies.find(p => p.tgUrl && p.enabled);
    const parsed = parseTgProxyUrlSimple(tgProxy?.tgUrl);
    if (parsed && parsed.server && parsed.port) {
      console.log('[PAC] TG Proxy configured - note: MTProto to SOCKS5 converter required');
      return null;
    }
  }

  const activeHttpProxy = (state.proxies || [])[state.activeProxyIndex] || state.proxies?.find(p => p.enabled && p.host && p.port);
  if (!activeHttpProxy || !activeHttpProxy.host || !activeHttpProxy.port) {
    return null;
  }

  const directive = pacDirective(activeHttpProxy.scheme, activeHttpProxy.host, activeHttpProxy.port);
  const { suffixes, wildcards, exacts } = collectDomains(state);

  if (suffixes.length === 0 && wildcards.length === 0 && exacts.length === 0) {
    return null;
  }

  const directiveJson = JSON.stringify(directive);

  return [
    'function FindProxyForURL(url, host) {',
    `  var suffixes = ${JSON.stringify(suffixes)};`,
    '  for (var i = 0; i < suffixes.length; i++) {',
    `    if (dnsDomainIs(host, suffixes[i])) return ${directiveJson};`,
    '  }',
    `  var wildcards = ${JSON.stringify(wildcards)};`,
    '  for (var i = 0; i < wildcards.length; i++) {',
    `    if (host !== wildcards[i] && dnsDomainIs(host, wildcards[i])) return ${directiveJson};`,
    '  }',
    `  var exacts = ${JSON.stringify(exacts)};`,
    '  for (var i = 0; i < exacts.length; i++) {',
    `    if (host === exacts[i]) return ${directiveJson};`,
    '  }',
    '  return "DIRECT";',
    '}',
  ].join('\n');
}
