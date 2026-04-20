import { loadState, saveState, getCurrentVersion, getChangelog, createProxyEntry, parseTgProxyUrl, getActiveProxy } from '../lib/storage.js';
import { buildPacScript } from '../lib/pac.js';
import { parseEntry, ValidationError } from '../lib/domain.js';
import { PRESET_DEFINITIONS, PRESET_ORDER } from '../lib/presets.js';
import { log, LOG_ACTIONS, getLogs, clearLogs } from '../lib/logger.js';

const $ = (sel) => document.querySelector(sel);
const SAVED_PROXY_LISTS_KEY = 'savedProxyLists';

const PROXIFLY_COUNTRIES_API = 'https://api.github.com/repos/proxifly/free-proxy-list/contents/proxies/countries';
const PROXIFLY_COUNTRY_RAW_BASE = 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries';
const TEST_ENGINE_VERSION = 'batch-v2';

let state = null;
let testController = null;
let testState = 'idle';
let t;

const translations = {
  en: {
    title: 'PAPA PROXY',
    settings: 'Proxy settings',
    version: 'Version info',
    routed: 'Routed services',
    custom: 'Custom domains',
    add: 'Add',
    addDomain: '+ Add',
    protocol: 'Protocol',
    auto: 'Auto',
    host: 'Host',
    port: 'Port',
    auth: 'Authentication',
    optional: 'optional',
    username: 'username',
    password: 'password',
    testAll: 'TEST ALL',
    testAllBtn: 'TEST ALL',
    testing: 'Testing...',
    testingProxy: 'Testing-',
    testingThisProxy: 'Testing...',
    allTested: 'All proxies tested',
    noProxiesToTest: 'No proxies to test',
    testingStopped: 'Testing stopped',
    removeInactive: 'Remove inactive',
    activeStatus: 'Active',
    autoSelectingStatus: 'Searching proxy',
    autoSelectingFoundStatus: 'Proxy selected',
    tgProxyLabel: 'TG proxy',
    addProxy: '+ Add Proxy',
    disabled: 'Disabled',
    active: 'Active',
    noProxy: 'No proxy configured',
    notConfigured: 'Setup needed',
    connectProxy: 'Connect a proxy to get started',
    enterHostPort: 'Enter the host, port and auth of your HTTP/SOCKS proxy.',
    openSettings: 'Open settings',
    saved: 'Saved automatically',
    currentCapabilities: 'Current capabilities',
    capabilityRouting: 'Routing and failover',
    capabilityProxyManagement: 'Proxy management',
    capabilityDiagnostics: 'Diagnostics and data',
    capabilityUi: 'UI and localization',
    changelog: 'Changelog',
    diffHeader: 'Changes from previous version:',
    proxyAdded: 'Proxy added',
    tgProxyAdded: 'TG Proxy added',
    proxyDeleted: 'Proxy deleted',
    tgProxyDeleted: 'TG Proxy deleted',
    cannotDeleteLast: 'Cannot delete last proxy',
    cannotDeleteLastTg: 'Cannot delete last TG proxy',
    domainLabel: 'Domain',
    domainName: 'Name',
    domainPlaceholder: 'example.com',
    namePlaceholder: 'My site',
    invalidHostname: 'Invalid hostname',
    alreadyInList: 'Already in list',
    settingsTooltip: 'Settings',
    backTooltip: 'Back',
    versionTooltip: 'Version',
    removeTooltip: 'Remove',
    donateTitle: 'DONATE',
    donateSubtitle: 'Accept donations for project development',
    network: 'Network',
    currency: 'Currency',
    wallet: 'Wallet',
    importTooltip: 'Import JSON',
    import: 'Import',
    cancel: 'Cancel',
    importSuccess: 'Proxies imported successfully',
    importError: 'Invalid JSON format',
    importProxyListTooltip: 'Load your proxies',
    importProxyListTitle: 'Load your proxies',
    importProxyListPlaceholder: 'socks4://81.31.244.44:43036\nsocks5://206.123.156.181:4633\nhttp://147.75.34.105:443',
    importProxyListSuccess: 'Proxy list loaded',
    importProxyListEmpty: 'Paste your proxy list',
    importProxyListInvalid: 'No valid proxies found',
    addCountry: '+ Country',
    loadingProxies: 'Searching proxies...',
    countryAdded: 'proxies added',
    failedToFetch: 'Failed to fetch',
    noInternet: 'No internet connection',
    connectionTimeout: 'Connection timeout',
    proxyAuthFailed: 'Proxy authentication failed',
    signalTimedOut: 'Signal timed out',
    saveTooltip: 'Save all proxies',
    loadTooltip: 'Load a saved proxy list',
    saveList: 'Save',
    saveNamePlaceholder: 'List name',
    savedSuccess: 'Proxies saved successfully',
    loadList: 'Load',
    loadedSuccess: 'Proxies loaded successfully',
    noSavedLists: 'No saved lists',
    enterName: 'Enter a name',
    domainRemoved: 'Domain removed',
    countryMismatch: 'Country mismatch',
    expectedCountry: 'expected',
    favoriteOnlyLabel: 'favorite only ⭐️',
    favoriteProxyTooltip: 'Favorite proxy',
    nextProxyTooltip: 'Start from next proxy',
    favoriteAdded: 'Added to favorites',
    favoriteRemoved: 'Removed from favorites'
  },
  ru: {
    title: 'PAPA PROXY',
    settings: '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043f\u0440\u043e\u043a\u0441\u0438',
    version: '\u0418\u043d\u0444\u043e \u043e \u0432\u0435\u0440\u0441\u0438\u0438',
    routed: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0438\u0440\u0443\u0435\u043c\u044b\u0435',
    custom: '\u0421\u0432\u043e\u0438 \u0434\u043e\u043c\u0435\u043d\u044b',
    add: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c',
    addDomain: '+ \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c',
    protocol: '\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b',
    auto: '\u0410\u0432\u0442\u043e',
    host: '\u0425\u043e\u0441\u0442',
    port: '\u041f\u043e\u0440\u0442',
    auth: '\u0410\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f',
    optional: '\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e',
    username: '\u043b\u043e\u0433\u0438\u043d',
    password: '\u043f\u0430\u0440\u043e\u043b\u044c',
    testAll: '\u0422\u0415\u0421\u0422 \u0412\u0421\u0415',
    testAllBtn: '\u0422\u0415\u0421\u0422 \u0412\u0421\u0415',
    testing: '\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435...',
    testingProxy: '\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435-',
    testingThisProxy: '\u0422\u0435\u0441\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044f...',
    allTested: '\u0412\u0441\u0435 \u043f\u0440\u043e\u043a\u0441\u0438 \u043f\u0440\u043e\u0442\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u044b',
    noProxiesToTest: '\u041d\u0435\u0442 \u043f\u0440\u043e\u043a\u0441\u0438 \u0434\u043b\u044f \u0442\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f',
    testingStopped: '\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e',
    removeInactive: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435',
    activeStatus: '\u0410\u043a\u0442\u0438\u0432\u0435\u043d',
    autoSelectingStatus: '\u0418\u0449\u0435\u0442\u0441\u044f \u043f\u0440\u043e\u043a\u0441\u0438',
    autoSelectingFoundStatus: '\u041f\u0440\u043e\u043a\u0441\u0438 \u0432\u044b\u0431\u0440\u0430\u043d',
    tgProxyLabel: 'TG proxy',
    addProxy: '+ \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c Proxy',
    disabled: '\u0412\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u043e',
    active: '\u0410\u043a\u0442\u0438\u0432\u043d\u043e',
    noProxy: '\u041d\u0435\u0442 \u043f\u0440\u043e\u043a\u0441\u0438',
    notConfigured: '\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430',
    connectProxy: '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u043f\u0440\u043e\u043a\u0441\u0438',
    enterHostPort: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0445\u043e\u0441\u0442, \u043f\u043e\u0440\u0442 \u0438 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044e HTTP/SOCKS \u043f\u0440\u043e\u043a\u0441\u0438.',
    openSettings: '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438',
    saved: '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438',
    currentCapabilities: '\u0422\u0435\u043a\u0443\u0449\u0438\u0435 \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e\u0441\u0442\u0438',
    capabilityRouting: '\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u0438 failover',
    capabilityProxyManagement: '\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043f\u0440\u043e\u043a\u0441\u0438',
    capabilityDiagnostics: '\u0414\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0430 \u0438 \u0434\u0430\u043d\u043d\u044b\u0435',
    capabilityUi: 'UI \u0438 \u043b\u043e\u043a\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f',
    changelog: '\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0432\u0435\u0440\u0441\u0438\u0439',
    diffHeader: '\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043f\u043e \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u044e \u0441 \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439:',
    proxyAdded: 'Proxy \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d',
    tgProxyAdded: 'TG Proxy \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d',
    proxyDeleted: 'Proxy \u0443\u0434\u0430\u043b\u0435\u043d',
    tgProxyDeleted: 'TG Proxy \u0443\u0434\u0430\u043b\u0435\u043d',
    cannotDeleteLast: '\u041d\u0435\u043b\u044c\u0437\u044f \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043f\u0440\u043e\u043a\u0441\u0438',
    cannotDeleteLastTg: '\u041d\u0435\u043b\u044c\u0437\u044f \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 TG \u043f\u0440\u043e\u043a\u0441\u0438',
    domainLabel: '\u0414\u043e\u043c\u0435\u043d',
    domainName: '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435',
    domainPlaceholder: 'example.com',
    namePlaceholder: '\u041c\u043e\u0439 \u0441\u0430\u0439\u0442',
    invalidHostname: '\u041d\u0435\u0432\u0435\u0440\u043d\u043e\u0435 \u0438\u043c\u044f \u0434\u043e\u043c\u0435\u043d\u0430',
    alreadyInList: '\u0423\u0436\u0435 \u0432 \u0441\u043f\u0438\u0441\u043a\u0435',
    settingsTooltip: '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438',
    backTooltip: '\u041d\u0430\u0437\u0430\u0434',
    versionTooltip: '\u0412\u0435\u0440\u0441\u0438\u044f',
    removeTooltip: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c',
    donateTitle: '\u041f\u041e\u0416\u0415\u0420\u0422\u0412\u041e\u0412\u0410\u041d\u0418\u0415',
    donateSubtitle: '\u041f\u043e\u0436\u0435\u0440\u0442\u0432\u043e\u0432\u0430\u043d\u0438\u044f \u043d\u0430 \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430',
    network: '\u0421\u0435\u0442\u044c',
    currency: '\u0412\u0430\u043b\u044e\u0442\u0430',
    wallet: '\u041a\u043e\u0448\u0435\u043b\u0435\u043a',
    importTooltip: '\u0418\u043c\u043f\u043e\u0440\u0442 JSON',
    import: '\u0418\u043c\u043f\u043e\u0440\u0442',
    cancel: '\u041e\u0442\u043c\u0435\u043d\u0430',
    importSuccess: '\u041f\u0440\u043e\u043a\u0441\u0438 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u044b',
    importError: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 JSON',
    importProxyListTooltip: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u0432\u043e\u0438 \u043f\u0440\u043e\u043a\u0441\u0438',
    importProxyListTitle: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u0432\u043e\u0438 \u043f\u0440\u043e\u043a\u0441\u0438',
    importProxyListPlaceholder: 'socks4://81.31.244.44:43036\nsocks5://206.123.156.181:4633\nhttp://147.75.34.105:443',
    importProxyListSuccess: '\u0421\u043f\u0438\u0441\u043e\u043a \u043f\u0440\u043e\u043a\u0441\u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d',
    importProxyListEmpty: '\u0412\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0441\u043f\u0438\u0441\u043e\u043a \u043f\u0440\u043e\u043a\u0441\u0438',
    importProxyListInvalid: '\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e \u0432\u0430\u043b\u0438\u0434\u043d\u044b\u0445 \u043f\u0440\u043e\u043a\u0441\u0438',
    addCountry: '+ \u0421\u0442\u0440\u0430\u043d\u0430',
    loadingProxies: '\u0418\u0449\u0435\u043c \u043f\u0440\u043e\u043a\u0441\u0438...',
    countryAdded: '\u043f\u0440\u043e\u043a\u0441\u0438 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e',
    failedToFetch: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f',
    noInternet: '\u041d\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f \u043a \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0443',
    connectionTimeout: '\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d \u0442\u0430\u0439\u043c\u0430\u0443\u0442',
    proxyAuthFailed: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043f\u0440\u043e\u043a\u0441\u0438',
    signalTimedOut: '\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d \u0442\u0430\u0439\u043c\u0430\u0443\u0442',
    saveTooltip: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432\u0441\u0435 \u043f\u0440\u043e\u043a\u0441\u0438',
    loadTooltip: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u0440\u043e\u043a\u0441\u0438 \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430',
    saveList: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c',
    saveNamePlaceholder: '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0441\u043f\u0438\u0441\u043a\u0430 \u043f\u0440\u043e\u043a\u0441\u0438',
    savedSuccess: '\u041f\u0440\u043e\u043a\u0441\u0438 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b',
    loadList: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c',
    loadedSuccess: '\u041f\u0440\u043e\u043a\u0441\u0438 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u044b',
    noSavedLists: '\u041d\u0435\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0445 \u0441\u043f\u0438\u0441\u043a\u043e\u0432',
    enterName: '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435',
    domainRemoved: '\u0414\u043e\u043c\u0435\u043d \u0443\u0434\u0430\u043b\u0435\u043d',
    countryMismatch: '\u0421\u0442\u0440\u0430\u043d\u0430 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442',
    expectedCountry: '\u043e\u0436\u0438\u0434\u0430\u043b\u0430\u0441\u044c',
    favoriteOnlyLabel: '\u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u044b\u0435 ⭐️',
    favoriteProxyTooltip: '\u0418\u0437\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0440\u043e\u043a\u0441\u0438',
    nextProxyTooltip: '\u041d\u0430\u0447\u0430\u0442\u044c \u0441\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u043f\u0440\u043e\u043a\u0441\u0438',
    favoriteAdded: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d \u0432 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u044b\u0435',
    favoriteRemoved: '\u0423\u0434\u0430\u043b\u0451\u043d \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u044b\u0445'
  }
};

t = translations.en;

function getCurrentCapabilities() {
  if ((state?.language || 'en') === 'ru') {
    return [
      {
        title: t.capabilityRouting,
        items: [
          'Точечная маршрутизация сервисов и пользовательских доменов через PAC без проксирования всего браузера',
          'Автопоиск рабочего proxy с подключением только при ping ниже 2000 мс',
          'Автопереключение при деградации текущего proxy, когда открыта маршрутизируемая вкладка',
        ],
      },
      {
        title: t.capabilityProxyManagement,
        items: [
          'Несколько HTTP / HTTPS / SOCKS5 / SOCKS4 proxy с логином и паролем',
          'Загрузка proxy по стране из Proxifly и загрузка своего списка из вставленного текста',
          'Избранные proxy, режим "только избранные", продолжение поиска со следующего proxy',
        ],
      },
      {
        title: t.capabilityDiagnostics,
        items: [
          'Тест одного proxy и TEST ALL с отображением ping, IP, страны и статуса',
          'Мгновенное удаление плохих proxy из автопоиска при ошибке или ping выше порога',
          'Логи отладки, экспорт сохраненных списков и избранных proxy в локальные JSON-файлы',
        ],
      },
      {
        title: t.capabilityUi,
        items: [
          'Интерфейс EN / RU, локализованные tooltip в тулбаре и экран версии внутри popup',
          'Состояния тулбара OFF / ON / FND для выключения, подключения и поиска',
          'Папка публичной поставки proxy_extension для ручной установки в Chromium-браузерах',
        ],
      },
    ];
  }

  return [
    {
      title: t.capabilityRouting,
      items: [
        'Per-site and custom-domain routing through PAC without proxying the whole browser',
        'Autonomous proxy search that connects only when latency is below 2000 ms',
        'Automatic failover when the active proxy degrades while a routed tab is open',
      ],
    },
    {
      title: t.capabilityProxyManagement,
      items: [
        'Multiple HTTP / HTTPS / SOCKS5 / SOCKS4 proxies with optional credentials',
        'Country proxy loading from Proxifly and manual list import from pasted proxy text',
        'Favorite proxies, favorite-only mode, and continue-from-next-proxy search',
      ],
    },
    {
      title: t.capabilityDiagnostics,
      items: [
        'Single-proxy test and TEST ALL with latency, IP, country, and status display',
        'Immediate pruning of bad proxies from autonomous search on error or high latency',
        'Debug logs plus export of saved proxy lists and favorites to local JSON files',
      ],
    },
    {
      title: t.capabilityUi,
      items: [
        'EN / RU interface, localized toolbar tooltips, and in-popup version screen',
        'OFF / ON / FND toolbar states for disabled, connected, and searching modes',
        'Public proxy_extension delivery folder for manual Chromium installation',
      ],
    },
  ];
}

function updateI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) {
      el.textContent = t[key];
      if (key === 'settings') {
        el.closest('#screen-settings')?.querySelector('.title')?.setAttribute('data-i18n', 'settings');
      }
    }
  });
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (t[key]) el.title = t[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (t[key]) el.placeholder = t[key];
  });
  
  document.getElementById('screen-main')?.querySelectorAll('.block-label[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
}

function syncLanguageButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

function setLanguage(lang) {
  t = translations[lang] || translations.en;
  state.language = lang;
  saveState(state);
  log(LOG_ACTIONS.LANGUAGE_CHANGED, { language: lang });
  syncLanguageButtons(lang);
  renderProxyGroups();
  renderMain();
  updateI18n();
  setTimeout(() => {
    attachProxyListeners();
  }, 100);
}

function getText(key) {
  return t[key] || translations.en[key] || key;
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code || '';
}

function getCountryMismatchMeta(result) {
  const required = normalizeCountryCode(state?.selectedCountryCode);
  const actual = normalizeCountryCode(result?.country);
  if (!required || !actual || required === actual) return null;
  return { required, actual };
}

function getTestAllButtonHtml(mode = 'idle', currentIndex = null) {
  if (mode === 'testing') {
    if (Number.isInteger(currentIndex)) {
      return `<span class="btn-white">${getText('testingProxy')}</span><span class="btn-red">${currentIndex}</span>`;
    }
    return `<span class="btn-white">${getText('testing')}</span>`;
  }

  if (mode === 'hasInactive') {
    if ((state.language || 'en') === 'ru') {
      return '<span class="btn-white">Удалить</span><span class="btn-blue">&nbsp;не активные</span>';
    }
    return '<span class="btn-white">Remove</span><span class="btn-blue">&nbsp;inactive</span>';
  }

  return `<span class="btn-blue">${getText('testAll')}</span>`;
}

function logTestUi(stage, details = {}) {
  log(LOG_ACTIONS.BUTTON_CLICK, {
    scope: 'TEST_ALL',
    stage,
    testState,
    ...details,
  });
}

const TEST_BATCH_SIZE = 5;
const FAST_FAILURE_THRESHOLD_MS = 1200;
const FAST_FAILURE_STREAK_LIMIT = 3;

function isFastFetchFailure(result) {
  if (!result || result.ok || result.pending) return false;
  const error = String(result.error || '');
  const latencyMs = Number(result.latencyMs || 0);
  return error.includes('Failed to fetch') && latencyMs > 0 && latencyMs <= FAST_FAILURE_THRESHOLD_MS;
}

function getProxyFailureLabel(result) {
  if (!result?.error) return '';

  const lang = state?.language || 'en';
  const error = String(result.error);

  if (result.engineRecoveryOk && error.includes('Failed to fetch')) {
    return lang === 'ru'
      ? 'Прокси не отвечает после чистого reset'
      : 'Proxy failed after clean reset';
  }

  if (result.engineRecoveryFailed) {
    return lang === 'ru'
      ? 'Сбой движка тестирования'
      : 'Test engine unstable';
  }

  if (error.includes('Failed to fetch')) {
    return lang === 'ru' ? 'Ошибка соединения' : 'Connection error';
  }

  if (error.includes('timeout') || error.includes('timed out') || error.includes('Signal timed out')) {
    return lang === 'ru' ? 'Превышен таймаут' : 'Connection timeout';
  }

  return error;
}

async function persist() {
  await saveState(state);

  const pac = buildPacScript(state);
  if (!chrome?.proxy?.settings) return;

  if (!state.enabled || !pac) {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    return;
  }

  await chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
    scope: 'regular',
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const TEST_ENDPOINTS = [
  {
    url: () => `https://ipinfo.io/json?ts=${Date.now()}`,
    parse: async (res) => {
      const data = await res.json();
      return { ip: data.ip || '', country: data.country || '' };
    },
  },
  {
    url: () => `https://api.ipify.org?format=json&ts=${Date.now()}`,
    parse: async (res) => {
      const data = await res.json();
      return { ip: data.ip || '', country: '' };
    },
  },
];

async function runProxyProbe(signal) {
  let lastError = null;

  for (const endpoint of TEST_ENDPOINTS) {
    const start = Date.now();
    try {
      const res = await fetch(endpoint.url(), {
        cache: 'no-store',
        signal,
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      const parsed = await endpoint.parse(res);
      return {
        ok: true,
        ip: parsed.ip,
        country: parsed.country,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Probe failed');
}

async function waitForDirectNetwork() {
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const signal = AbortSignal.timeout(2500);
      await runProxyProbe(signal);
      logTestUi('direct-network-ok', { attempt });
      return true;
    } catch (error) {
      lastError = error;
      logTestUi('direct-network-wait', {
        attempt,
        error: String(error?.message || error),
      });
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Direct network did not recover');
}

async function resetNetworkBetweenBatches(reason = 'batch-reset') {
  await chrome.proxy.settings.clear({ scope: 'regular' });
  await sleep(600);
  await waitForDirectNetwork();
  await sleep(900);
  logTestUi('network-reset', { reason });
}

async function renderDebugPanel() {
  $('#debug-package-version').textContent = `v${getCurrentVersion()}`;
  $('#debug-test-engine').textContent = TEST_ENGINE_VERSION;
  $('#debug-extension-id').textContent = chrome?.runtime?.id || 'unknown';

  const output = $('#debug-log-view');
  if (!output) return;

  try {
    const logs = await getLogs();
    const lines = logs.map((entry) => {
      const time = new Date(entry.timestamp || Date.now()).toLocaleTimeString('ru-RU', {
        hour12: false,
      });
      const details = entry.details ? JSON.stringify(entry.details) : '{}';
      return `[${time}] ${entry.action} ${details}`;
    });
    output.textContent = lines.length ? lines.join('\n\n') : 'No logs yet';
  } catch (error) {
    output.textContent = `Failed to load logs: ${String(error?.message || error)}`;
  }
}

function resetManualProxyImportModal() {
  const input = $('#import-proxy-text');
  if (input) input.value = '';
}

async function togglePreset(key) {
  if (!state.presets?.[key]) return;
  state.presets[key].enabled = !state.presets[key].enabled;
  await persist();
  log(LOG_ACTIONS.PRESET_TOGGLED, { key, enabled: state.presets[key].enabled });
  renderMain();
}

async function toggleCustom(entry) {
  const target = state.customDomains?.find(
    (item) => item.value === entry.value && item.mode === entry.mode,
  );
  if (!target) return;
  target.enabled = target.enabled === false;
  await persist();
  renderMain();
}

async function removeCustom(entry) {
  state.customDomains = (state.customDomains || []).filter(
    (item) => !(item.value === entry.value && item.mode === entry.mode),
  );
  await persist();
  log(LOG_ACTIONS.DOMAIN_REMOVED, { value: entry.value, mode: entry.mode });
  renderMain();
  showToast(t.domainRemoved || 'Domain removed');
}

async function addCustomDomain(rawValue, rawName = '') {
  const parsed = parseEntry(rawValue);
  const exists = (state.customDomains || []).some(
    (item) => item.value === parsed.value && item.mode === parsed.mode,
  );
  if (exists) {
    throw new ValidationError(t.alreadyInList || 'Already in list');
  }

  state.customDomains = state.customDomains || [];
  state.customDomains.push({
    ...parsed,
    name: rawName.trim(),
    enabled: true,
  });

  await persist();
  log(LOG_ACTIONS.DOMAIN_ADDED, { value: parsed.value, mode: parsed.mode });
  renderMain();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}

async function getSavedProxyLists() {
  const data = await chrome.storage.local.get(SAVED_PROXY_LISTS_KEY);
  return data[SAVED_PROXY_LISTS_KEY] || [];
}

async function backupSavedProxyListsToDisk(lists) {
  if (!chrome?.downloads?.download) return;

  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'PAPA PROXY',
    version: getCurrentVersion(),
    lists,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename: 'PAPA_PROXY_DATA/saved-proxy-lists.json',
      conflictAction: 'overwrite',
      saveAs: false,
    });
  } catch (error) {
    logTestUi('lists-backup-failed', {
      error: String(error?.message || error),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getFavoriteProxyExportPayload() {
  const favorites = (state?.proxies || [])
    .filter((proxy) => !proxy?.tgUrl && proxy?.favorite === true)
    .map((proxy) => sanitizeProxy(proxy));

  return {
    exportedAt: new Date().toISOString(),
    app: 'PAPA PROXY',
    version: getCurrentVersion(),
    selectedCountryCode: state?.selectedCountryCode || null,
    favoriteOnly: !!state?.favoriteOnly,
    favorites,
  };
}

async function backupFavoriteProxiesToDisk() {
  if (!chrome?.downloads?.download) return;

  const payload = getFavoriteProxyExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename: 'PAPA_PROXY_DATA/favorite-proxies.json',
      conflictAction: 'overwrite',
      saveAs: false,
    });
  } catch (error) {
    logTestUi('favorites-backup-failed', {
      error: String(error?.message || error),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function saveSavedProxyLists(lists) {
  await chrome.storage.local.set({ [SAVED_PROXY_LISTS_KEY]: lists });
  await backupSavedProxyListsToDisk(lists);
}

function sanitizeProxy(proxy) {
  return {
    id: proxy.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    host: String(proxy.host || '').trim(),
    port: Number(proxy.port) || '',
    scheme: proxy.scheme || 'auto',
    user: proxy.user || '',
    pass: proxy.pass || '',
    enabled: proxy.enabled !== false,
    favorite: proxy.favorite === true,
    lastTest: proxy.lastTest || null,
  };
}

async function importSavedProxyListsFromFile(file) {
  const raw = await file.text();
  const payload = JSON.parse(raw);
  const sourceLists = Array.isArray(payload) ? payload : payload?.lists;

  if (!Array.isArray(sourceLists)) {
    throw new Error('Invalid backup format');
  }

  const normalized = sourceLists.map((item) => ({
    name: String(item.name || '').trim(),
    createdAt: Number(item.createdAt) || Date.now(),
    proxies: Array.isArray(item.proxies) ? item.proxies.map(sanitizeProxy) : [],
  })).filter((item) => item.name);

  await saveSavedProxyLists(normalized);
  return normalized.length;
}

async function exportRuntimeProxyData() {
  await backupSavedProxyListsToDisk(await getSavedProxyLists());
  await backupFavoriteProxiesToDisk();
}

async function importManualProxyList(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error(getText('importProxyListEmpty'));
  }

  const proxies = lines
    .map((line) => tryParseProxyUrl(line))
    .filter((proxy) => proxy?.host && proxy?.port)
    .map((proxy) => sanitizeProxy({
      ...proxy,
      enabled: true,
      lastTest: null,
    }));

  if (!proxies.length) {
    throw new Error(getText('importProxyListInvalid'));
  }

  const tgProxies = (state.proxies || []).filter((proxy) => proxy.tgUrl);
  state.proxies = [...proxies, ...tgProxies];
  state.activeProxyIndex = proxies.length ? 0 : -1;
  state.proxy = state.proxies[state.activeProxyIndex] || null;
  state.selectedCountryCode = null;

  await persist();
  log(LOG_ACTIONS.PROXY_IMPORTED, { source: 'manual_list', count: proxies.length });
  return proxies.length;
}

function getCountryDisplayName(code) {
  const locale = (state?.language || 'en') === 'ru' ? 'ru' : 'en';

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

async function fetchCountryOptions() {
  const response = await fetch(PROXIFLY_COUNTRIES_API, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : [];

  return items
    .filter((item) => item?.type === 'dir' && /^[A-Z]{2}$/.test(item.name || ''))
    .map((item) => ({
      code: item.name,
      label: getCountryDisplayName(item.name),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function saveCurrentProxyList() {
  const nameInput = $('#save-name-input');
  const name = nameInput?.value.trim();
  if (!name) {
    showToast(t.enterName || 'Enter a name');
    return;
  }

  const proxies = (state.proxies || [])
    .filter((proxy) => !proxy.tgUrl && (proxy.host || proxy.port || proxy.user || proxy.pass))
    .map(sanitizeProxy);

  const lists = await getSavedProxyLists();
  const next = lists.filter((item) => item.name !== name);
  next.unshift({
    name,
    createdAt: Date.now(),
    proxies,
    selectedCountryCode: state.selectedCountryCode || null,
  });

  await saveSavedProxyLists(next);
  log(LOG_ACTIONS.PROXY_SAVED, { name, count: proxies.length });
  closeModal('save-modal');
  if (nameInput) nameInput.value = '';
  showToast(t.savedSuccess || 'Proxies saved successfully');
}

async function loadSavedProxyList(name) {
  const lists = await getSavedProxyLists();
  const selected = lists.find((item) => item.name === name);
  if (!selected) return;

  const tgProxies = (state.proxies || []).filter((proxy) => proxy.tgUrl);
  state.proxies = [...selected.proxies.map(sanitizeProxy), ...tgProxies];
  state.activeProxyIndex = selected.proxies.length ? 0 : -1;
  state.selectedCountryCode = selected.selectedCountryCode || null;
  state.proxy = state.activeProxyIndex >= 0 ? state.proxies[state.activeProxyIndex] || null : null;
  await persist();
  log(LOG_ACTIONS.PROXY_LOADED, { name, count: selected.proxies.length });
  closeModal('load-modal');
  renderSettings();
  bindSettings();
  showToast(t.loadedSuccess || 'Proxies loaded successfully');
}

async function renderSavedLists() {
  const container = $('#saved-list');
  if (!container) return;

  const lists = await getSavedProxyLists();
  container.innerHTML = '';

  if (!lists.length) {
    const empty = document.createElement('div');
    empty.className = 'country-item';
    empty.textContent = t.noSavedLists || 'No saved lists';
    container.appendChild(empty);
    return;
  }

  lists.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-item';
    button.textContent = `${item.name} (${item.proxies?.length || 0})`;
    button.addEventListener('click', () => loadSavedProxyList(item.name));
    container.appendChild(button);
  });
}

async function fetchCountryProxies(countryCode) {
  const url = `${PROXIFLY_COUNTRY_RAW_BASE}/${encodeURIComponent(countryCode)}/data.txt`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.text();
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => tryParseProxyUrl(line))
    .filter((proxy) => proxy?.host && proxy?.port)
    .map((proxy) => sanitizeProxy({
      ...proxy,
      enabled: true,
      lastTest: null,
    }));
}

async function addCountryProxies(countryCode) {
  const proxies = await fetchCountryProxies(countryCode);
  if (!proxies.length) {
    throw new Error('No proxies');
  }

  const tgProxies = (state.proxies || []).filter((proxy) => proxy.tgUrl);
  state.proxies = [...proxies, ...tgProxies];
  state.activeProxyIndex = proxies.length ? 0 : -1;
  state.proxy = state.proxies[state.activeProxyIndex] || null;
  state.selectedCountryCode = String(countryCode || '').trim().toUpperCase() || null;

  await persist();
  log(LOG_ACTIONS.PROXY_IMPORTED, { countryCode, count: proxies.length });
  closeModal('country-modal');
  renderSettings();
  bindSettings();
  showToast(`${proxies.length} ${t.countryAdded || 'proxies added'}`);
}

async function renderCountryList() {
  const container = $('#country-list');
  if (!container) return;

  container.innerHTML = '';

  const countries = await fetchCountryOptions();
  countries.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'country-item';
    button.textContent = `${item.label} (${item.code})`;
    button.addEventListener('click', async () => {
      try {
        showToast(t.loadingProxies || 'Searching proxies...');
        await addCountryProxies(item.code);
      } catch (error) {
        showToast(error?.message || (t.failedToFetch || 'Failed to fetch'));
      }
    });
    container.appendChild(button);
  });
}

async function init() {
  state = await loadState();
  window.PAPA_PROXY_DEBUG = {
    getLogs,
    clearLogs,
    testEngineVersion: TEST_ENGINE_VERSION,
    extensionId: chrome?.runtime?.id || 'unknown',
  };
  if (state.language === 'ru') {
    t = translations.ru;
  }
  renderProxyGroups();
  routeInitialScreen();
  bindMain();
  bindSettings();
  bindFirstRun();
}

function routeInitialScreen() {
  const screens = ['main', 'settings', 'firstrun', 'version', 'donate'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;

  const hasProxies = state.proxies?.length > 0 && state.proxies.some(p => p.host || p.tgUrl);
  if (!hasProxies) {
    $('#screen-firstrun').hidden = false;
  } else {
    showMain();
  }
}

function showMain() {
  const screens = ['main', 'settings', 'firstrun', 'version', 'donate'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-main').hidden = false;
  syncLanguageButtons(state.language || 'en');
  updateI18n();
  renderMain();
}

function showSettings() {
  testController?.abort();
  testState = 'idle';
  const btn = $('#test-all-btn');
  if (btn) {
    btn.className = 'test-all-btn';
    btn.innerHTML = getTestAllButtonHtml();
  }
  log(LOG_ACTIONS.SETTINGS_OPENED, { proxiesCount: state.proxies?.length || 0 });
  const screens = ['main', 'settings', 'firstrun', 'version', 'donate'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-settings').hidden = false;
  syncLanguageButtons(state.language || 'en');
  renderSettings();
  setTimeout(() => {
    attachProxyListeners();
  }, 100);
}

function showVersion() {
  const screens = ['main', 'settings', 'firstrun', 'version', 'donate'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-version').hidden = false;
  renderVersion();
}

function showDonate() {
  const screens = ['main', 'settings', 'firstrun', 'version', 'donate'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-donate').hidden = false;
}

function renderVersion() {
  const version = 'v.' + getCurrentVersion();
  const changelog = getChangelog();
  const capabilities = getCurrentCapabilities();
  $('#current-version').textContent = version;
  const capabilityList = $('#capabilities-list');
  capabilityList.innerHTML = '';
  for (const group of capabilities) {
    const item = document.createElement('div');
    item.className = 'changelog-item capability-item';
    item.innerHTML = `
      <div class="version-header">
        <div class="version-num">${group.title}</div>
      </div>
      <ul class="version-features">${group.items.map((entry) => `<li>${entry}</li>`).join('')}</ul>
    `;
    capabilityList.appendChild(item);
  }
  const list = $('#changelog-list');
  list.innerHTML = '';
  
  for (let i = 0; i < changelog.length; i++) {
    const entry = changelog[i];
    const item = document.createElement('div');
    item.className = 'changelog-item';
    const statusClass = entry.status === 'stable' ? 'stable' : 'beta';
    
    let changesHtml = '';
    if (entry.features && entry.features.length > 0) {
      changesHtml = `<ul class="version-features">${entry.features.map(f => `<li>${f}</li>`).join('')}</ul>`;
    }
    
    if (entry.changesFromPrevious && entry.changesFromPrevious.length > 0) {
      changesHtml += `<div class="version-diff"><div class="diff-header">${t.diffHeader || 'Changes from previous version:'}</div><ul class="version-changes">${entry.changesFromPrevious.map(c => `<li>${c}</li>`).join('')}</ul></div>`;
    }
    
    item.innerHTML = `
      <div class="version-header">
        <span class="version-num">v.${entry.version}</span>
        <span class="version-status ${statusClass}">${entry.status}</span>
        <span class="version-date">${entry.date}</span>
      </div>
      ${changesHtml}
    `;
    list.appendChild(item);
  }
}

function renderMain() {
  updateI18n();
  
  const logoBtn = $('#logo-toggle');
  const status = $('#status-line');
  const activeProxy = getActiveProxy(state);
  const connectedProxy = state?.proxy && state.proxy.host ? state.proxy : activeProxy;
  const favoriteBtn = $('#favorite-proxy-btn');
  const nextBtn = $('#next-proxy-btn');
  const favoriteOnlyToggle = $('#favorite-only-toggle');
  const favoriteOnlyLabel = $('#favorite-only-label');
  if (favoriteOnlyToggle) favoriteOnlyToggle.checked = !!state.favoriteOnly;
  if (favoriteOnlyLabel) favoriteOnlyLabel.textContent = getText('favoriteOnlyLabel');
  if (favoriteBtn) {
    const favoriteLit = !!state.enabled && !state.autoSelecting?.running && !!connectedProxy?.favorite;
    favoriteBtn.classList.toggle('active', favoriteLit);
    favoriteBtn.disabled = !connectedProxy || !!state.autoSelecting?.running;
    favoriteBtn.title = getText('favoriteProxyTooltip');
  }
  if (nextBtn) {
    nextBtn.disabled = !activeProxy;
    nextBtn.title = getText('nextProxyTooltip');
  }
  if (!state.enabled) {
    status.textContent = t.disabled || 'Disabled';
    status.classList.add('no-dot');
    logoBtn.classList.add('disabled-state');
    logoBtn.classList.remove('active');
    logoBtn.classList.remove('searching');
  } else {
    logoBtn.classList.remove('disabled-state');
    status.classList.remove('no-dot');
    logoBtn.classList.add('active');
    logoBtn.classList.toggle('searching', !!state.autoSelecting?.running);
    const displayedProxy = activeProxy?.lastTest ? activeProxy : (state.proxy || activeProxy);
    if (state.autoSelecting?.running) {
      const currentIndex = Number.isInteger(state.autoSelecting.index) ? state.autoSelecting.index + 1 : null;
      const suffix = currentIndex ? ` · Proxy-${currentIndex}` : '';
      status.textContent = `${getText('autoSelectingStatus')}${suffix} .....`;
      status.classList.remove('ok', 'error');
      status.classList.add('amber');
    } else if (!displayedProxy) {
      status.textContent = t.noProxy || 'No proxy configured';
      status.classList.remove('ok', 'amber');
    } else if (displayedProxy.lastTest?.ok) {
      status.textContent = `${getText('activeStatus')} · ${displayedProxy.lastTest.ip} · ${displayedProxy.lastTest.country || ''} · ${displayedProxy.lastTest.latencyMs} ms`;
      status.classList.remove('amber', 'error');
      status.classList.add('ok');
    } else if (displayedProxy.tgUrl) {
      status.textContent = `${getText('activeStatus')} · ${getText('tgProxyLabel')}`;
      status.classList.remove('amber', 'error');
    } else {
      status.textContent = `${getText('activeStatus')} · ${displayedProxy.host}:${displayedProxy.port}`;
      status.classList.remove('amber', 'error');
    }
  }

  // RKN compliance banner
  const rknResults = state.rknResults || {};
  const blockedNames = [];
  for (const key of PRESET_ORDER) {
    const def = PRESET_DEFINITIONS[key];
    const isBlocked = (def.domains || []).some((d) => rknResults[d]?.blocked);
    if (isBlocked) blockedNames.push(def.label);
  }
  const banner = $('#rkn-banner');
  if (blockedNames.length) {
    $('#rkn-text').textContent =
      `${blockedNames.join(', ')} — blocked by Roskomnadzor. Routing disabled to comply with Russian law.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  // Preset grid
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  for (const key of PRESET_ORDER) {
    const def = PRESET_DEFINITIONS[key];
    const stored = state.presets[key];
    const isBlocked = (def.domains || []).some((d) => rknResults[d]?.blocked);
    const card = document.createElement('div');
    card.className = 'preset-card'
      + (stored?.enabled ? ' on' : '')
      + (isBlocked ? ' rkn-blocked' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <div class="icon">${def.icon}</div>
      <div class="label">${def.label}</div>
    `;
    if (!isBlocked) {
      card.addEventListener('click', () => togglePreset(key));
    }
    grid.appendChild(card);
  }

  // Custom domains list
  const list = $('#custom-list');
  list.innerHTML = '';
  for (const entry of state.customDomains || []) {
    const item = document.createElement('div');
    const isEnabled = entry.enabled !== false;
    item.className = 'custom-item' + (isEnabled ? ' on' : '');
    item.dataset.value = entry.value;
    item.dataset.mode = entry.mode;
    const display = entry.mode === 'wildcard'
      ? '*.' + entry.value
      : entry.mode === 'exact' ? '=' + entry.value : entry.value;
    const label = entry.name || display;
    const removeTitle = t.removeTooltip || 'Remove';
    item.innerHTML = 
      '<div class="icon">' + (isEnabled ? '✓' : '○') + '</div>' +
      '<div class="label">' + escapeHtml(label) + '</div>' +
      '<button class="remove" type="button" title="' + removeTitle + '">×</button>';
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        removeCustom(entry);
      } else {
        toggleCustom(entry);
      }
    });
    list.appendChild(item);
  }
}

function bindMain() {
  $('#logo-toggle').addEventListener('click', async () => {
    state.enabled = !state.enabled;
    if (!state.enabled) {
      state.pendingStartAfterIndex = null;
    }

    await persist();
    log(LOG_ACTIONS.TOGGLE_CHANGED, { enabled: state.enabled });
    renderMain();
  });

  $('#favorite-proxy-btn')?.addEventListener('click', async () => {
    const targetProxy = state?.proxy && state.proxy.host ? state.proxy : getActiveProxy(state);
    if (!targetProxy) return;
    targetProxy.favorite = targetProxy.favorite !== true;
    if (state.proxy && state.proxy.id === targetProxy.id) {
      state.proxy.favorite = targetProxy.favorite;
    }
    await persist();
    await backupFavoriteProxiesToDisk();
    showToast(targetProxy.favorite ? getText('favoriteAdded') : getText('favoriteRemoved'));
    renderMain();
  });

  $('#next-proxy-btn')?.addEventListener('click', async () => {
    const resumeIndex = Number.isInteger(state.lastAutoSelectIndex) ? state.lastAutoSelectIndex : state.activeProxyIndex;
    if (!Number.isInteger(resumeIndex) || resumeIndex < 0) return;
    state.pendingStartAfterIndex = resumeIndex;
    state.enabled = true;
    await persist();
    log(LOG_ACTIONS.BUTTON_CLICK, {
      scope: 'NEXT_PROXY',
      currentIndex: resumeIndex,
      favoriteOnly: !!state.favoriteOnly,
    });
    await chrome.runtime.sendMessage({ type: 'START_AUTO_SELECT', reason: 'popup-next' }).catch(() => null);
    renderMain();
  });

  $('#favorite-only-toggle')?.addEventListener('change', async (event) => {
    state.favoriteOnly = !!event.target?.checked;
    await persist();
    renderMain();
  });

  $('#open-settings').addEventListener('click', () => showSettings());

  $('#open-version').addEventListener('click', () => showVersion());
  $('#open-donate').addEventListener('click', () => showDonate());
  $('#back-from-donate').addEventListener('click', () => showMain());

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLanguage(lang);
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMain();
});
  });

  $('#add-domain-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const input = $('#add-domain-input');
    const nameInput = $('#add-domain-name');
    const error = $('#add-domain-error');
    if (!input || !nameInput || !error) return;

    error.hidden = true;
    error.textContent = '';

    try {
      await addCustomDomain(input.value, nameInput.value);
      input.value = '';
      nameInput.value = '';
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof ValidationError
        ? err.message
        : (t.invalidHostname || 'Invalid hostname');
    }
  });

}

function bindSettings() {
  $('#back-to-main').onclick = () => showMain();
  $('#back-from-version').onclick = () => showMain();
  const addProxyGroupBtn = $('#add-proxy-group-btn');
  if (addProxyGroupBtn) {
    addProxyGroupBtn.onclick = () => addProxyGroup();
  }
  $('#import-proxy-list-btn').onclick = () => {
    resetManualProxyImportModal();
    openModal('import-proxy-modal');
  };
  $('#import-proxy-cancel-btn').onclick = () => closeModal('import-proxy-modal');
  $('#import-proxy-confirm-btn').onclick = async () => {
    try {
      const count = await importManualProxyList($('#import-proxy-text')?.value || '');
      closeModal('import-proxy-modal');
      renderSettings();
      bindSettings();
      showToast(`${count} ${getText('importProxyListSuccess')}`);
    } catch (error) {
      showToast(error?.message || getText('importProxyListInvalid'));
    }
  };
  $('#add-country-btn').onclick = async () => {
    const container = $('#country-list');
    if (container) {
      container.innerHTML = `<div class="country-item">${getText('loadingProxies') || 'Loading...'}</div>`;
    }
    openModal('country-modal');

    try {
      await renderCountryList();
    } catch (error) {
      if (container) {
        container.innerHTML = `<div class="country-item">${escapeHtml(error?.message || (t.failedToFetch || 'Failed to fetch'))}</div>`;
      }
    }
  };
  $('#country-cancel-btn').onclick = () => closeModal('country-modal');
  $('#save-proxies-btn').onclick = () => openModal('save-modal');
  $('#save-cancel-btn').onclick = () => closeModal('save-modal');
  $('#save-confirm-btn').onclick = () => saveCurrentProxyList();
  $('#load-proxies-btn').onclick = async () => {
    await renderSavedLists();
    openModal('load-modal');
  };
  $('#load-cancel-btn').onclick = () => closeModal('load-modal');
  $('#debug-refresh-btn').onclick = async () => {
    await renderDebugPanel();
  };
  $('#debug-clear-btn').onclick = async () => {
    clearLogs();
    await sleep(100);
    await renderDebugPanel();
  };
  $('#debug-export-lists-btn').onclick = async () => {
    const lists = await getSavedProxyLists();
    await backupSavedProxyListsToDisk(lists);
    showToast((state.language || 'en') === 'ru'
      ? 'Списки сохранены в файл'
      : 'Lists exported to file');
  };
  $('#debug-import-lists-btn').onclick = () => {
    $('#debug-import-file')?.click();
  };
  $('#debug-import-file').onchange = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
      const count = await importSavedProxyListsFromFile(file);
      showToast((state.language || 'en') === 'ru'
        ? `Импортировано списков: ${count}`
        : `Imported lists: ${count}`);
      await renderDebugPanel();
    } catch (error) {
      showToast((state.language || 'en') === 'ru'
        ? 'Ошибка импорта списка'
        : 'List import failed');
    } finally {
      event.target.value = '';
    }
  };

  const proxyGroups = $('#proxy-groups');
  if (proxyGroups && !proxyGroups.dataset.addProxyBound) {
    proxyGroups.dataset.addProxyBound = '1';
    proxyGroups.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#add-proxy-group-btn')) {
        addProxyGroup();
      }
    });
  }

  $('#test-all-btn').onclick = async () => {
    const btn = $('#test-all-btn');
    logTestUi('click', {
      buttonClass: btn?.className || null,
      buttonText: btn?.textContent?.trim() || null,
    });

    if (testState === 'testing') {
      logTestUi('abort-requested');
      testController?.abort();
      return;
    }

    if (testState === 'hasInactive') {
      const proxies = state.proxies?.filter(p => !p.tgUrl && p.host && p.port) || [];
      const toRemove = proxies.filter((p) => (
        p.lastTest
        && !p.lastTest.pending
        && (!p.lastTest.ok || p.lastTest.latencyMs > 2000)
      ));
      logTestUi('remove-inactive', {
        proxiesCount: proxies.length,
        removeCount: toRemove.length,
      });
      state.proxies = state.proxies.filter(p => !toRemove.includes(p));
      await saveState(state);
      renderSettings();
      bindSettings();
      testState = 'idle';
      const finalBtn = $('#test-all-btn');
      if (finalBtn) {
        finalBtn.className = 'test-all-btn';
        finalBtn.innerHTML = getTestAllButtonHtml();
        logTestUi('remove-inactive-finished', {
          buttonClass: finalBtn.className,
          buttonText: finalBtn.textContent?.trim() || null,
        });
      }
      showToast(t.allTested || 'All tested');
      return;
    }

    const validProxiesCheck = state.proxies?.filter(p => !p.tgUrl && p.host && p.port) || [];
    if (validProxiesCheck.length === 0) {
      showToast(getText('noProxiesToTest') || 'No proxies to test');
      return;
    }

    testState = 'testing';
    testController = new AbortController();
    btn.className = 'test-all-btn testing';
    btn.innerHTML = getTestAllButtonHtml('testing');
    logTestUi('testing-started', {
      proxiesCount: validProxiesCheck.length,
      buttonClass: btn.className,
      buttonText: btn.textContent?.trim() || null,
    });

    const proxies = state.proxies?.filter(p => !p.tgUrl && p.host && p.port) || [];
    let fastFailureStreak = 0;
    let transportUnstable = false;

    for (let batchStart = 0; batchStart < proxies.length; batchStart += TEST_BATCH_SIZE) {
      if (testController.signal.aborted || transportUnstable) break;

      const batchEnd = Math.min(batchStart + TEST_BATCH_SIZE, proxies.length);
      logTestUi('batch-start', {
        batchStart,
        batchEnd,
        total: proxies.length,
      });

      if (batchStart > 0) {
        await resetNetworkBetweenBatches('batch-boundary');
      }

      for (let i = batchStart; i < batchEnd; i++) {
        if (testController.signal.aborted || transportUnstable) break;

        proxies[i].lastTest = { pending: true };
        logTestUi('proxy-pending', {
          index: i,
          host: proxies[i].host,
          port: proxies[i].port,
        });
        renderSettings();
        bindSettings();

        const refreshedBtn = $('#test-all-btn');
        if (refreshedBtn) {
          refreshedBtn.className = 'test-all-btn testing';
          refreshedBtn.innerHTML = getTestAllButtonHtml('testing', i + 1);
        }

        const currentBtn = $('#test-all-btn') || btn;
        currentBtn.innerHTML = getTestAllButtonHtml('testing', i + 1);

        const result = await testProxyConnection(proxies[i]);
        proxies[i].lastTest = result;
        logTestUi('proxy-finished', {
          index: i,
          host: proxies[i].host,
          port: proxies[i].port,
          ok: !!result?.ok,
          pending: !!result?.pending,
          latencyMs: result?.latencyMs ?? null,
          error: result?.error ?? null,
        });

        if (isFastFetchFailure(result)) {
          fastFailureStreak += 1;
          logTestUi('fast-failure-streak', {
            index: i,
            streak: fastFailureStreak,
            latencyMs: result?.latencyMs ?? null,
            error: result?.error ?? null,
          });
        } else {
          fastFailureStreak = 0;
        }

        if (fastFailureStreak >= FAST_FAILURE_STREAK_LIMIT) {
          transportUnstable = true;
          logTestUi('transport-unstable', {
            index: i,
            streak: fastFailureStreak,
          });
        }

        renderSettings();
        bindSettings();

        const nextBtnAfterRender = $('#test-all-btn');
        if (nextBtnAfterRender && !testController.signal.aborted && !transportUnstable) {
          nextBtnAfterRender.className = 'test-all-btn testing';
          nextBtnAfterRender.innerHTML = getTestAllButtonHtml('testing', i + 1);
        }
      }

      logTestUi('batch-finished', {
        batchStart,
        batchEnd,
        fastFailureStreak,
        transportUnstable,
      });
    }

    await saveState(state);
    renderSettings();
    bindSettings();
    log(LOG_ACTIONS.PROXY_TEST_ALL, { testedCount: proxies.length });

    const hasInactive = proxies.some((p) => (
      p.lastTest
      && !p.lastTest.pending
      && (!p.lastTest.ok || p.lastTest.latencyMs > 2000)
    ));
    logTestUi('testing-finished', {
      aborted: !!testController?.signal?.aborted,
      proxiesCount: proxies.length,
      hasInactive,
      transportUnstable,
      testedSummary: proxies.map((p, index) => ({
        index,
        host: p.host,
        ok: p.lastTest?.ok ?? null,
        pending: !!p.lastTest?.pending,
        latencyMs: p.lastTest?.latencyMs ?? null,
        error: p.lastTest?.error ?? null,
      })),
    });
    if (hasInactive) {
      testState = 'hasInactive';
      const nextBtn = $('#test-all-btn');
      if (nextBtn) {
        nextBtn.className = 'test-all-btn remove-inactive';
        nextBtn.innerHTML = getTestAllButtonHtml('hasInactive');
        logTestUi('button-has-inactive-set', {
          buttonClass: nextBtn.className,
          buttonText: nextBtn.textContent?.trim() || null,
        });
      }
    } else {
      testState = 'idle';
      const nextBtn = $('#test-all-btn');
      if (nextBtn) {
        nextBtn.className = 'test-all-btn';
        nextBtn.innerHTML = getTestAllButtonHtml();
        logTestUi('button-reset-idle', {
          buttonClass: nextBtn.className,
          buttonText: nextBtn.textContent?.trim() || null,
        });
      }
      showToast(t.allTested || 'All proxies tested');
    }

    if (transportUnstable) {
      showToast((state.language || 'en') === 'ru'
        ? 'Тестирование остановлено: сеть стала нестабильной'
        : 'Testing stopped: network became unstable');
    }
  };

  document.querySelectorAll('.proxy-group').forEach(group => {
    const idx = parseInt(group.dataset.index);
    const hostInput = group.querySelector('.cfg-host');
    const portInput = group.querySelector('.cfg-port');
    const userInput = group.querySelector('.cfg-user');
    const passInput = group.querySelector('.cfg-pass');

    hostInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].host = hostInput.value.trim();
        await saveState(state);
      }
    });

    portInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].port = parseInt(portInput.value, 10) || 0;
        await saveState(state);
      }
    });

    userInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].user = userInput.value;
        await saveState(state);
      }
    });

    passInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].pass = passInput.value;
        await saveState(state);
      }
    });

    group.querySelectorAll('.pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
        if (proxies[idx]) {
          proxies[idx].scheme = pill.dataset.scheme;
          await saveState(state);
          renderSettings();
          bindSettings();
        }
      });
    });
  });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.onclick = () => deleteProxy(parseInt(btn.dataset.index, 10));
  });

}

async function testProxyConnection(proxy) {
  if (!proxy?.host || !proxy?.port) {
    return { ok: false, error: 'No proxy' };
  }

  try {
    const signal = testController
      ? AbortSignal.any([testController.signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000);
    const pac = buildTestPac(proxy);
    await chrome.proxy.settings.set({
      value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
      scope: 'regular',
    });
    await sleep(400);

    try {
      return await runProxyProbe(signal);
    } catch (firstError) {
      const message = String(firstError?.message || firstError);
      logTestUi('probe-retry', {
        host: proxy.host,
        port: proxy.port,
        error: message,
      });

      if (signal.aborted) {
        throw firstError;
      }

      await chrome.proxy.settings.clear({ scope: 'regular' });
      await sleep(500);
      await waitForDirectNetwork();
      await chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
        scope: 'regular',
      });
      await sleep(700);

      return await runProxyProbe(signal);
    }
  } catch (err) {
    let errorMsg = String(err?.message || err);
    if (err?.name === 'AbortError' || errorMsg.includes('aborted')) {
      errorMsg = getText('testingStopped') || 'Testing stopped';
    }
    return { ok: false, error: errorMsg };
  } finally {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    await sleep(300);
    try {
      await waitForDirectNetwork();
    } catch (error) {
      logTestUi('direct-network-recovery-failed', {
        host: proxy.host,
        port: proxy.port,
        error: String(error?.message || error),
      });
    }
  }
}

function buildTestPac(proxy) {
  const { scheme, host, port } = proxy;
  let directive;
  switch (scheme) {
    case 'https': directive = `HTTPS ${host}:${port}`; break;
    case 'socks5': directive = `SOCKS5 ${host}:${port}`; break;
    case 'socks4': directive = `SOCKS ${host}:${port}`; break;
    default: directive = `PROXY ${host}:${port}`;
  }
  return `function FindProxyForURL(url, host) { return "${directive}"; }`;
}

function addProxyGroup() {
  const groups = state.proxies?.filter(p => !p.tgUrl) || [];
  const newIndex = groups.length + 1;
  
  state.proxies = state.proxies || [];
  const newProxy = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    host: '',
    port: '',
    scheme: 'auto',
    user: '',
    pass: '',
    enabled: true,
    lastTest: null,
  };
  state.proxies.push(newProxy);
  
  saveState(state);
  log(LOG_ACTIONS.PROXY_ADDED, { proxyNumber: newIndex, type: 'HTTP', totalProxies: state.proxies.length });
  renderSettings();
  bindSettings();
  setTimeout(() => {
    attachProxyListeners();
  }, 50);
  showToast(t.proxyAdded || `Proxy-${newIndex} added`);
}

function addTgProxyGroup() {
  const groups = state.proxies?.filter(p => p.tgUrl) || [];
  const newIndex = groups.length + 1;
  
  state.proxies = state.proxies || [];
  state.proxies.push({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    tgUrl: '',
    user: '',
    pass: '',
    enabled: true,
    lastTest: null,
  });
  
  saveState(state);
  log(LOG_ACTIONS.PROXY_ADDED, { proxyNumber: newIndex, type: 'TG', totalProxies: state.proxies.length });
  renderTgProxyGroups();
  setTimeout(() => {
    attachProxyListeners();
    attachTgProxyListeners();
  }, 50);
  showToast(t.tgProxyAdded || `TG Proxy-${newIndex} added`);
}

function deleteProxy(idx) {
  const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
  if (proxies.length <= 1) {
    showToast(t.cannotDeleteLast || 'Cannot delete last proxy');
    return;
  }
  const proxyToDelete = proxies[idx];
  state.proxies = state.proxies.filter(p => p !== proxyToDelete);
  saveState(state);
  log(LOG_ACTIONS.PROXY_REMOVED, { proxyNumber: idx + 1, host: proxyToDelete.host, port: proxyToDelete.port, remainingProxies: state.proxies.length });
  renderProxyGroups();
  showToast(t.proxyDeleted || 'Proxy deleted');
}

function deleteTgProxy(idx) {
  const proxies = state.proxies?.filter(p => p.tgUrl) || [];
  if (proxies.length <= 1) {
    showToast(t.cannotDeleteLastTg || 'Cannot delete last TG proxy');
    return;
  }
  const proxyToDelete = proxies[idx];
  state.proxies = state.proxies.filter(p => p !== proxyToDelete);
  saveState(state);
  renderTgProxyGroups();
  showToast(t.tgProxyDeleted || 'TG Proxy deleted');
}

function renderProxyGroups() {
  const container = $('#proxy-groups');
  if (!container) return;

  try {
    container.innerHTML = '';
  } catch (e) {
    return;
  }
  if (!t) return;
  
  try {
    let proxies = state.proxies?.filter(p => !p.tgUrl) || [];
    if (proxies.length === 0) {
      proxies = [{ host: '', port: '', scheme: 'auto', user: '', pass: '', enabled: true, lastTest: null }];
    }
    
    const addBtnText = t.addProxy || '+ Add Proxy';

    proxies.forEach((proxy, idx) => {
      const section = document.createElement('section');
      section.className = 'block proxy-group';
      section.dataset.index = idx;
      
      const testResult = proxy.lastTest;
      const hasValidProxy = proxy.host && proxy.port;
      let pingDisplay = '—';
      if (hasValidProxy && testResult?.pending) {
        const testingLabel = (state?.language || 'en') === 'ru' ? 'Тестируется' : 'Testing';
        pingDisplay = `<span class="testing-status-label">${testingLabel}</span><span class="testing-status-dots">.....</span>`;
      } else if (hasValidProxy && testResult?.ok) {
        const ip = testResult.ip || '';
        const country = testResult.country || '';
        const lat = testResult.latencyMs || 0;
        pingDisplay = '✓ ' + lat + 'ms';
        if (ip) pingDisplay += ' · ' + ip;
        if (country) pingDisplay += ' · ' + country;
      } else if (hasValidProxy && testResult?.error) {
        let errMsg = testResult.error;
        if (errMsg.includes('Failed to fetch')) errMsg = t.failedToFetch || errMsg;
        else if (errMsg.includes('timeout') || errMsg.includes('timed out')) errMsg = t.signalTimedOut || errMsg;
        else if (errMsg.includes('AbortError')) errMsg = t.signalTimedOut || errMsg;
        pingDisplay = errMsg;
      }
      
      const labelText = 'Proxy-' + (idx + 1);
      const hostLabel = t.host || 'Host';
      const portLabel = t.port || 'Port';
      const authLabel = t.auth || 'Authentication';
      const optionalText = t.optional || 'optional';
      const userPlaceholder = t.username || 'username';
      const passPlaceholder = t.password || 'password';
      
      section.innerHTML = 
        '<div class="group-header">' +
          '<span class="group-label">' + labelText + '</span>' +
          '<span class="ping-result">' + pingDisplay + '</span>' +
          '<button type="button" class="delete-btn" data-index="' + idx + '" title="Delete">×</button>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field grow">' +
            '<div class="block-label">' + hostLabel + '</div>' +
            '<input type="text" class="cfg-host" value="' + escapeHtml(proxy.host || '') + '" autocomplete="off" />' +
          '</div>' +
          '<div class="field port">' +
            '<div class="block-label">' + portLabel + '</div>' +
            '<input type="text" class="cfg-port" value="' + proxy.port + '" autocomplete="off" inputmode="numeric" />' +
          '</div>' +
        '</div>' +
        '<div class="block-label-row">' +
          '<span class="block-label">' + authLabel + '</span>' +
          '<span class="hint">' + optionalText + '</span>' +
        '</div>' +
        '<input type="text" class="cfg-user" value="' + escapeHtml(proxy.user || '') + '" placeholder="' + userPlaceholder + '" autocomplete="off" />' +
        '<input type="password" class="cfg-pass" value="' + escapeHtml(proxy.pass || '') + '" placeholder="' + passPlaceholder + '" autocomplete="off" />';
      container.appendChild(section);
    });
    
    const addSection = document.createElement('section');
    addSection.className = 'block add-group-section';
    addSection.innerHTML = 
      '<button type="button" class="add-group-btn" id="add-proxy-group-btn">' + addBtnText + '</button>';
    container.appendChild(addSection);
  } catch (e) {
    container.innerHTML = '';
  }
}

function attachProxyListeners() {
  const groups = document.querySelectorAll('.proxy-group');
  const proxies = state.proxies?.filter(proxy => !proxy.tgUrl) || [];
  
  groups.forEach((group, i) => {
    if (!proxies[i]) return;
    
    const hostInput = group.querySelector('.cfg-host');
    const portInput = group.querySelector('.cfg-port');
    const userInput = group.querySelector('.cfg-user');
    const passInput = group.querySelector('.cfg-pass');
    
    const proxyIndex = state.proxies.indexOf(proxies[i]);
    
    if (hostInput) {
      hostInput.onchange = () => {
        if (proxyIndex >= 0) {
          state.proxies[proxyIndex].host = hostInput.value.trim();
          saveState(state);
        }
      };
    }
    if (portInput) {
      portInput.onchange = () => {
        if (proxyIndex >= 0) {
          state.proxies[proxyIndex].port = parseInt(portInput.value, 10) || 0;
          saveState(state);
        }
      };
    }
    if (userInput) {
      userInput.onchange = () => {
        if (proxyIndex >= 0) {
          state.proxies[proxyIndex].user = userInput.value;
          saveState(state);
        }
      };
    }
    if (passInput) {
      passInput.onchange = () => {
        if (proxyIndex >= 0) {
          state.proxies[proxyIndex].pass = passInput.value;
          saveState(state);
        }
      };
    }
  });
}

function attachTgProxyListeners() {
  return;
}

function renderTgProxyGroups() {
  return;
}

function renderSettings() {
  ensureProxyObject();
  renderProxyGroups();
  updateI18n();
  attachProxyListeners();
  renderDebugPanel();
  const btn = $('#test-all-btn');
  if (btn) {
    logTestUi('render-settings', {
      buttonClass: btn.className,
      buttonText: btn.textContent?.trim() || null,
      proxiesCount: (state.proxies || []).filter((proxy) => !proxy.tgUrl).length,
    });
  }
  $('#test-result').hidden = true;
}

function showToast(message) {
  if (!message) return;

  const existing = document.getElementById('popup-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.id = 'popup-toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.left = '12px';
  toast.style.right = '12px';
  toast.style.bottom = '12px';
  toast.style.zIndex = '9999';
  toast.style.padding = '10px 12px';
  toast.style.borderRadius = '10px';
  toast.style.background = 'rgba(18, 24, 38, 0.96)';
  toast.style.color = '#fff';
  toast.style.fontSize = '13px';
  toast.style.lineHeight = '1.35';
  toast.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.28)';

  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

/**
 * Try to parse a proxy string. Supported formats:
 *   - socks5://user:pass@host:port  (URL style)
 *   - http://host:port
 *   - host:port:user:pass            (provider style, e.g. 196.16.109.114:8000:N0eT6k:UK2c2X)
 *   - host:port
 * Returns { scheme?, host, port?, user?, pass? } or null if it's just a plain hostname.
 */
function tryParseProxyUrl(input) {
  const SCHEMES = { http: 'http', https: 'https', socks5: 'socks5', socks4: 'socks4', socks: 'socks5' };

  // --- Provider format: host:port:user:pass ---
  // Detect by splitting on colons: 4 parts where part[1] is a number.
  const hasScheme = /^[a-z][a-z0-9]*:\/\//i.test(input);
  if (!hasScheme) {
    const parts = input.trim().split(':');
    if (parts.length === 4 && /^\d+$/.test(parts[1])) {
      // Provider format: no scheme → auto-detect will determine it
      return {
        host: parts[0],
        port: parseInt(parts[1], 10),
        user: parts[2],
        pass: parts[3],
      };
    }
    // host:port only
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      return { host: parts[0], port: parseInt(parts[1], 10) };
    }
  }

  // --- URL format: scheme://user:pass@host:port ---
  if (!hasScheme) return null;

  let scheme = null;
  let rest = input;

  const schemeMatch = input.match(/^([a-z][a-z0-9]*):\/\//i);
  if (schemeMatch) {
    scheme = SCHEMES[schemeMatch[1].toLowerCase()] || null;
    rest = input.slice(schemeMatch[0].length);
  }

  let user = null;
  let pass = undefined;
  const atIdx = rest.indexOf('@');
  if (atIdx !== -1) {
    const userinfo = rest.slice(0, atIdx);
    rest = rest.slice(atIdx + 1);
    const colonIdx = userinfo.indexOf(':');
    if (colonIdx !== -1) {
      user = decodeURIComponent(userinfo.slice(0, colonIdx));
      pass = decodeURIComponent(userinfo.slice(colonIdx + 1));
    } else {
      user = decodeURIComponent(userinfo);
    }
  }

  rest = rest.split(/[/?#]/)[0];
  let host = rest;
  let port = null;
  const portMatch = rest.match(/:(\d+)$/);
  if (portMatch) {
    port = parseInt(portMatch[1], 10);
    host = rest.slice(0, -portMatch[0].length);
  }

  if (!host) return null;

  const result = { host };
  if (scheme) result.scheme = scheme;
  if (port) result.port = port;
  if (user) result.user = user;
  if (pass !== undefined) result.pass = pass;
  return result;
}

function ensureProxyObject() {
  if (!state.proxies) {
    state.proxies = [];
  }
  if (state.proxies.length === 0) {
    state.proxies.push(createProxyEntry());
  }
  if (state.enabled && (state.activeProxyIndex < 0 || state.activeProxyIndex >= state.proxies.length)) {
    state.activeProxyIndex = 0;
  }
  state.proxy = state.activeProxyIndex >= 0 ? state.proxies[state.activeProxyIndex] : null;
  if (state.enabled && !state.proxy) {
    state.proxy = createProxyEntry();
    state.proxies[0] = state.proxy;
    state.activeProxyIndex = 0;
  }
}

function renderProxyList() {
  const list = $('#proxy-list');
  list.innerHTML = '';
  const proxies = state.proxies || [];
  let shownCount = 0;
  
  for (let i = 0; i < proxies.length; i++) {
    const p = proxies[i];
    if (p.tgUrl) continue;
    if (!p.host || !p.port) continue;
    shownCount++;
    
    const item = document.createElement('div');
    item.className = 'proxy-item';
    const isActive = i === state.activeProxyIndex;
    const dotClass = p.lastTest?.ok ? 'ok' : (p.lastTest ? 'error' : 'inactive');
    const display = `${p.host}:${p.port}`;
    
    item.innerHTML = `
      <div class="dot ${dotClass}" title="${isActive ? 'Active' : 'Inactive'}"></div>
      <div class="info">${escapeHtml(display)}</div>
      <button type="button" class="remove" data-index="${i}">&times;</button>
    `;
    
    item.querySelector('.remove').addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.index);
      state.proxies.splice(idx, 1);
      if (state.activeProxyIndex >= state.proxies.length) {
        state.activeProxyIndex = Math.max(0, state.proxies.length - 1);
      }
      await persist();
      renderSettings();
    });
    
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('remove')) return;
      state.activeProxyIndex = i;
      await persist();
      renderSettings();
    });
    
    list.appendChild(item);
  }
  
  list.hidden = shownCount === 0;
}

function renderTgList() {
  const list = $('#tg-list');
  list.innerHTML = '';
  const proxies = state.proxies || [];
  let shownCount = 0;
  
  for (let i = 0; i < proxies.length; i++) {
    const p = proxies[i];
    if (!p.tgUrl) continue;
    shownCount++;
    
    const item = document.createElement('div');
    item.className = 'tg-item';
    const parsed = parseTgProxyUrl(p.tgUrl);
    const display = parsed ? `${parsed.server}:${parsed.port}` : 'TG';
    const dotClass = p.lastTest?.ok ? 'ok' : 'inactive';
    
    item.innerHTML = `
      <div class="dot ${dotClass}"></div>
      <div class="info">${escapeHtml(display)}</div>
      <button type="button" class="remove" data-index="${i}">&times;</button>
    `;
    
    item.querySelector('.remove').addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.index);
      state.proxies.splice(idx, 1);
      await persist();
      renderSettings();
    });
    
    list.appendChild(item);
  }
  
  list.hidden = shownCount === 0;
}

async function autoDetectScheme() {
  if (!state.proxy?.host || !state.proxy?.port) return;

  const result = $('#test-result');
  const autoPill = document.querySelector('.pill[data-scheme="auto"]');
  result.hidden = false;
  result.className = 'result-block detecting';
  result.innerHTML = '\u25f7 Detecting\u2026 HTTP';
  if (autoPill) autoPill.classList.add('detecting');

  // Fire-and-forget to background. Popup watches storage for live updates.
  chrome.runtime.sendMessage({
    type: 'DETECT_SCHEME',
    host: state.proxy.host,
    port: state.proxy.port,
    user: state.proxy.user || '',
    pass: state.proxy.pass || '',
  });
}

// Watch storage changes for detect progress + general state updates.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.state) return;
  const newState = changes.state.newValue;
  if (!newState) return;
  state = newState;

   if (!$('#screen-main')?.hidden) {
    renderMain();
  }
  if (!$('#screen-settings')?.hidden) {
    renderSettings();
  }

  const ds = state.detectStatus;
  const result = $('#test-result');
  const autoPill = document.querySelector('.pill[data-scheme="auto"]');

  if (ds?.running) {
    result.hidden = false;
    result.className = 'result-block detecting';
    result.innerHTML = `\u25f7 Detecting\u2026 ${ds.trying?.toUpperCase() || ''}`;
    if (autoPill) autoPill.classList.add('detecting');
  } else if (ds && !ds.running) {
    if (autoPill) autoPill.classList.remove('detecting');
    result.hidden = false;
    if (ds.ok) {
      result.className = 'result-block ok';
      result.textContent = `\u2713 Detected: ${ds.scheme.toUpperCase()}`;
      renderSettings();
    } else {
      result.className = 'result-block err';
      result.textContent = `\u2717 ${ds.error || 'Detection failed'}`;
    }
  }
});

async function runTest(type) {
  const btnProxy = $('#test-proxy');
  const btnGemini = $('#test-gemini');
  const result = $('#test-result');
  btnProxy.disabled = true;
  btnGemini.disabled = true;
  result.hidden = true;

  try {
    const res = await chrome.runtime.sendMessage({ type });
    result.hidden = false;
    if (res.ok) {
      result.className = 'result-block ok';
      if (type === 'TEST_PROXY') {
        result.innerHTML = `\u2713 Proxy reachable<br>IP: ${res.ip || '?'}<br>Country: ${res.country || '?'}<br>Latency: ${res.latencyMs} ms`;
      } else {
        result.innerHTML = `\u2713 Gemini reachable<br>HTTP ${res.httpStatus}<br>Latency: ${res.latencyMs} ms`;
      }
      state = await loadState();
    } else {
      result.className = 'result-block err';
      result.textContent = `\u2717 ${res.error}`;
    }
  } finally {
    btnProxy.disabled = false;
    btnGemini.disabled = false;
  }
}

// --- First-run screen ---

function bindFirstRun() {
  $('#firstrun-open-settings').addEventListener('click', () => {
    ensureProxyObject();
    showSettings();
  });

  document.querySelectorAll('#screen-firstrun .lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLanguage(lang);
      document.querySelectorAll('#screen-firstrun .lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const currentLang = state.language || 'en';
  document.querySelectorAll('#screen-firstrun .lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
  syncLanguageButtons(currentLang);
  updateI18n();
}

init();
