// Logging system for PAPA PROXY

const LOG_KEY = 'logs';

const MAX_LOGS = 500;

export function log(action, details = {}) {
  const entry = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    action,
    details,
  };
  
  chrome.storage.local.get([LOG_KEY], (result) => {
    let logs = result[LOG_KEY] || [];
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(0, MAX_LOGS);
    }
    chrome.storage.local.set({ [LOG_KEY]: logs });
  });
  
  console.log(`[PAPA PROXY] ${action}`, details);
}

export function getLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOG_KEY], (result) => {
      resolve(result[LOG_KEY] || []);
    });
  });
}

export function clearLogs() {
  chrome.storage.local.set({ [LOG_KEY]: [] });
}

export const LOG_ACTIONS = {
  // UI Actions
  BUTTON_CLICK: 'BUTTON_CLICK',
  TOGGLE_CHANGED: 'TOGGLE_CHANGED',
  LANGUAGE_CHANGED: 'LANGUAGE_CHANGED',
  
  // Proxy Actions
  PROXY_ADDED: 'PROXY_ADDED',
  PROXY_REMOVED: 'PROXY_REMOVED',
  PROXY_UPDATED: 'PROXY_UPDATED',
  PROXY_TESTED: 'PROXY_TESTED',
  PROXY_TEST_ALL: 'PROXY_TEST_ALL',
  PROXY_IMPORTED: 'PROXY_IMPORTED',
  PROXY_SAVED: 'PROXY_SAVED',
  PROXY_LOADED: 'PROXY_LOADED',
  PROXY_ENABLED: 'PROXY_ENABLED',
  PROXY_DISABLED: 'PROXY_DISABLED',
  
  // Traffic
  TRAFFIC_ROUTED: 'TRAFFIC_ROUTED',
  TRAFFIC_DIRECT: 'TRAFFIC_DIRECT',
  
  // Failover
  FAILOVER_START: 'FAILOVER_START',
  FAILOVER_SWITCH: 'FAILOVER_SWITCH',
  FAILOVER_FAILED: 'FAILOVER_FAILED',
  FAILOVER_ALL_FAILED: 'FAILOVER_ALL_FAILED',
  
  // Connection
  CONNECTION_OK: 'CONNECTION_OK',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  
  // Settings
  SETTINGS_OPENED: 'SETTINGS_OPENED',
  SETTINGS_CLOSED: 'SETTINGS_CLOSED',
  PRESET_TOGGLED: 'PRESET_TOGGLED',
  DOMAIN_ADDED: 'DOMAIN_ADDED',
  DOMAIN_REMOVED: 'DOMAIN_REMOVED',
  
  // Version
  VERSION_VIEWED: 'VERSION_VIEWED',
  APP_STARTED: 'APP_STARTED',
};
