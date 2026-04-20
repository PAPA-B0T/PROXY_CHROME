// chrome.action wrapper. Sets icon, badge, and tooltip per state.

function getLang(info) {
  return String(info?.language || 'en').toLowerCase() === 'ru' ? 'ru' : 'en';
}

function getTooltip(state, info) {
  const lang = getLang(info);
  const host = info?.host || '';
  const country = info?.country || '';
  const latencyMs = info?.latencyMs;
  const index = info?.index;
  const reason = info?.reason || '';

  if (lang === 'ru') {
    switch (state) {
      case 'off':
        return 'PAPA PROXY - выключено';
      case 'searching':
        return `PAPA PROXY - поиск рабочего прокси${host ? ' - ' + host : ''}${Number.isInteger(index) ? ' - #' + (index + 1) : ''}`;
      case 'routed':
        return `PAPA PROXY - ${host} через прокси${country ? ' (' + country + ')' : ''}${latencyMs ? ' - ' + latencyMs + ' мс' : ''}`;
      case 'direct':
        return `PAPA PROXY - включено, ${host} напрямую (не в списке маршрутизации)`;
      case 'error':
        return `PAPA PROXY - ошибка прокси: ${reason || 'недоступен'}`;
      default:
        return 'PAPA PROXY';
    }
  }

  switch (state) {
    case 'off':
      return 'PAPA PROXY - disabled';
    case 'searching':
      return `PAPA PROXY - searching for a working proxy${host ? ' - ' + host : ''}${Number.isInteger(index) ? ' - #' + (index + 1) : ''}`;
    case 'routed':
      return `PAPA PROXY - ${host} routed via proxy${country ? ' (' + country + ')' : ''}${latencyMs ? ' - ' + latencyMs + ' ms' : ''}`;
    case 'direct':
      return `PAPA PROXY - enabled, ${host} is direct (not in routed list)`;
    case 'error':
      return `PAPA PROXY - proxy error: ${reason || 'unreachable'}`;
    default:
      return 'PAPA PROXY';
  }
}

const STATES = {
  off: {
    iconBase: 'icons/off',
    badge: 'OFF',
    badgeColor: '#ef4444',
  },
  searching: {
    iconBase: 'icons/routed',
    badge: 'FND',
    badgeColor: '#f59e0b',
  },
  routed: {
    iconBase: 'icons/routed',
    badge: 'ON',
    badgeColor: '#10b981',
  },
  direct: {
    iconBase: 'icons/direct',
    badge: 'ON',
    badgeColor: '#10b981',
  },
  error: {
    iconBase: 'icons/error',
    badge: '!',
    badgeColor: '#ef4444',
  },
};

const ICON_SIZES = [16, 32, 48, 128];

/**
 * Set the toolbar icon for a single tab. `state` is one of:
 * 'off' | 'searching' | 'routed' | 'direct' | 'error'.
 * `info` is an object with optional fields: host, country, latencyMs, reason.
 */
export async function setIconState(tabId, state, info = {}) {
  const config = STATES[state];
  if (!config) throw new Error(`Unknown icon state: ${state}`);

  const path = {};
  for (const size of ICON_SIZES) {
    path[size] = `${config.iconBase}-${size}.png`;
  }
  await chrome.action.setIcon({ tabId, path });

  let badgeText = config.badge;
  if (state === 'routed') {
    badgeText = info.country || config.badge || 'ON';
  }

  await chrome.action.setBadgeText({ tabId, text: badgeText });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: config.badgeColor });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  }

  await chrome.action.setTitle({ tabId, title: getTooltip(state, info) });
}
