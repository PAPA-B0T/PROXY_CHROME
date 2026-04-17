import { loadState, saveState, getCurrentVersion, getChangelog, createProxyEntry, parseTgProxyUrl, getActiveProxy } from '../lib/storage.js';
import { buildPacScript } from '../lib/pac.js';
import { parseEntry, ValidationError } from '../lib/domain.js';
import { PRESET_DEFINITIONS, PRESET_ORDER } from '../lib/presets.js';

const $ = (sel) => document.querySelector(sel);

let state = null;

const translations = {
  en: {
    title: 'PAPA PROXY',
    settings: 'Proxy settings',
    version: 'Version info',
    routed: 'Routed services',
    custom: 'Custom domains',
    add: 'Add',
    protocol: 'Protocol',
    auto: 'Auto',
    host: 'Host',
    port: 'Port',
    auth: 'Authentication',
    optional: 'optional',
    username: 'username',
    password: 'password',
    testAll: 'TEST ALL',
    addProxy: '+ Add Proxy',
    addTgProxy: '+ Add TG Proxy',
    disabled: 'Disabled',
    noProxy: 'No proxy configured',
    notConfigured: 'Setup needed',
    connectProxy: 'Connect a proxy to get started',
    enterHostPort: 'Enter the host, port and auth of your HTTP/SOCKS proxy.',
    openSettings: 'Open settings',
  },
  ru: {
    title: 'PAPA PROXY',
    settings: 'Настройки прокси',
    version: 'Инфо о версии',
    routed: 'Маршрутизируемые',
    custom: 'Свои домены',
    add: 'Добавить',
    protocol: 'Протокол',
    auto: 'Авто',
    host: 'Хост',
    port: 'Порт',
    auth: 'Авторизация',
    optional: 'необязательно',
    username: 'логин',
    password: 'пароль',
    testAll: 'ТЕСТ ВСЕ',
    addProxy: '+ Добавить Proxy',
    addTgProxy: '+ Добавить TG Proxy',
    disabled: 'Выключено',
    noProxy: 'Нет прокси',
    notConfigured: 'Требуется настройка',
    connectProxy: 'Подключите прокси',
    enterHostPort: 'Введите хост, порт и авторизацию HTTP/SOCKS прокси.',
    openSettings: 'Настройки',
  },
};

let t = translations.en;

function setLanguage(lang) {
  t = translations[lang] || translations.en;
  state.language = lang;
  saveState(state);
  renderProxyGroups();
  renderTgProxyGroups();
  renderMain();
  setTimeout(() => {
    attachProxyListeners();
    attachTgProxyListeners();
  }, 100);
}

function getText(key) {
  return t[key] || translations.en[key] || key;
}

async function init() {
  state = await loadState();
  if (state.language === 'ru') {
    t = translations.ru;
  }
  renderProxyGroups();
  renderTgProxyGroups();
  routeInitialScreen();
  bindMain();
  bindSettings();
  bindFirstRun();
}

function routeInitialScreen() {
  const screens = ['main', 'settings', 'firstrun', 'version'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;

  const hasProxies = state.proxies?.length > 0 && state.proxies.some(p => p.host || p.tgUrl);
  if (!hasProxies) {
    $('#screen-firstrun').hidden = false;
  } else {
    showMain();
  }
}

function showMain() {
  const screens = ['main', 'settings', 'firstrun', 'version'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-main').hidden = false;
  renderMain();
}

function showSettings() {
  const screens = ['main', 'settings', 'firstrun', 'version'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-settings').hidden = false;
  renderSettings();
  setTimeout(() => {
    attachProxyListeners();
    attachTgProxyListeners();
  }, 100);
}

function showVersion() {
  const screens = ['main', 'settings', 'firstrun', 'version'];
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  $('#screen-version').hidden = false;
  renderVersion();
}

function renderVersion() {
  const version = 'v.' + getCurrentVersion();
  const changelog = getChangelog();
  $('#current-version').textContent = version;
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
      changesHtml += `<div class="version-diff"><div class="diff-header">Изменения по сравнению с предыдущей версией:</div><ul class="version-changes">${entry.changesFromPrevious.map(c => `<li>${c}</li>`).join('')}</ul></div>`;
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
  const status = $('#status-line');
  if (!state.enabled) {
    status.textContent = 'Disabled';
    status.classList.add('no-dot');
  } else {
    status.classList.remove('no-dot');
    const activeProxy = getActiveProxy(state);
    if (!activeProxy) {
      status.textContent = 'No proxy configured';
    } else if (activeProxy.lastTest?.ok) {
      status.textContent = `Active · ${activeProxy.lastTest.ip} · ${activeProxy.lastTest.country || ''} · ${activeProxy.lastTest.latencyMs} ms`;
    } else if (activeProxy.tgUrl) {
      status.textContent = 'Active · TG proxy';
    } else {
      status.textContent = `Active · ${activeProxy.host}:${activeProxy.port}`;
    }
  }

  $('#master-toggle').checked = !!state.enabled;

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
    item.className = 'custom-item';
    const display = entry.mode === 'wildcard'
      ? `*.${entry.value}`
      : entry.mode === 'exact' ? `=${entry.value}` : entry.value;
    item.innerHTML = `
      <div class="dot"></div>
      <div class="value">${escapeHtml(display)}</div>
      <button class="remove" type="button" title="Remove">\u00d7</button>
    `;
    item.querySelector('.remove').addEventListener('click', () => removeCustom(entry));
    list.appendChild(item);
  }
}

function bindMain() {
  $('#master-toggle').addEventListener('change', async (e) => {
    state.enabled = e.target.checked;
    await persist();
    renderMain();
  });

  $('#open-settings').addEventListener('click', () => showSettings());

  $('#open-version').addEventListener('click', () => showVersion());

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      setLanguage(lang);
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMain();
    });
  });

  const currentLang = state.language || 'en';
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  $('#add-domain-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#add-domain-input');
    const errEl = $('#add-domain-error');
    const btn = $('#add-domain-btn');
    errEl.hidden = true;

    let entry;
    try {
      entry = parseEntry(input.value);
    } catch (err) {
      if (err instanceof ValidationError) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        return;
      }
      throw err;
    }

    // Dedupe
    const exists = (state.customDomains || []).find(
      (x) => x.value === entry.value && x.mode === entry.mode
    );
    if (exists) {
      errEl.textContent = 'Already in list';
      errEl.hidden = false;
      return;
    }

    // RKN compliance check
    btn.disabled = true;
    btn.textContent = 'Checking\u2026';
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'CHECK_DOMAIN',
        domain: entry.value,
      });
      if (result?.blocked) {
        errEl.textContent = `\u26d4 ${entry.value} is blocked by Roskomnadzor \u2014 cannot add (149-FZ)`;
        errEl.hidden = false;
        return;
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Add';
    }

    state.customDomains = state.customDomains || [];
    state.customDomains.push(entry);
    await persist();
    input.value = '';
    renderMain();

    // Success toast + confetti
    showToast(`\u2713 ${entry.value} added \u2014 not blocked by RKN`);
    launchConfetti();
  });
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2400);
}

function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti';
  document.body.appendChild(container);

  const colors = ['#10b981', '#06b6d4', '#6366f1', '#f59e0b', '#ec4899'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.animationDuration = (1 + Math.random() * 0.8) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 2200);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function removeCustom(entry) {
  state.customDomains = (state.customDomains || []).filter(
    (x) => !(x.value === entry.value && x.mode === entry.mode)
  );
  await persist();
  renderMain();
}

async function togglePreset(key) {
  state.presets[key].enabled = !state.presets[key].enabled;
  await persist();
  renderMain();
}

async function persist() {
  await saveState(state);
}

// --- Settings screen ---

function bindSettings() {
  $('#back-to-main').addEventListener('click', () => showMain());
  $('#back-from-version').addEventListener('click', () => showMain());

  document.addEventListener('click', (e) => {
    if (e.target.id === 'add-proxy-group-btn') {
      addProxyGroup();
    }
    if (e.target.id === 'add-tg-group-btn') {
      addTgProxyGroup();
    }
    if (e.target.classList.contains('delete-btn')) {
      const idx = parseInt(e.target.dataset.index);
      const isTg = e.target.closest('.tg-group');
      if (isTg) {
        deleteTgProxy(idx);
      } else {
        deleteProxy(idx);
      }
    }
  });

  $('#test-all-btn')?.addEventListener('click', async () => {
    const btn = $('#test-all-btn');
    btn.textContent = 'Testing...';
    const proxies = state.proxies || [];
    for (let i = 0; i < proxies.length; i++) {
      if (proxies[i].host && proxies[i].port) {
        const result = await testProxyConnection(proxies[i]);
        proxies[i].lastTest = result;
      }
    }
    await saveState(state);
    btn.textContent = 'TEST ALL';
    renderProxyGroups();
    renderTgProxyGroups();
    bindSettings();
    showToast('All proxies tested');
  });

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
          renderProxyGroups();
          bindSettings();
        }
      });
    });
  });

  document.querySelectorAll('.tg-group').forEach(group => {
    const idx = parseInt(group.dataset.index);
    const tgInput = group.querySelector('.cfg-tg-url');
    const userInput = group.querySelector('.cfg-tg-user');
    const passInput = group.querySelector('.cfg-tg-pass');

    tgInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].tgUrl = tgInput.value.trim();
        await saveState(state);
      }
    });

    userInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].user = userInput.value;
        await saveState(state);
      }
    });

    passInput?.addEventListener('blur', async () => {
      const proxies = state.proxies?.filter(p => p.tgUrl) || [];
      if (proxies[idx]) {
        proxies[idx].pass = passInput.value;
        await saveState(state);
      }
    });
  });
}

async function testProxyConnection(proxy) {
  if (!proxy?.host || !proxy?.port) {
    return { ok: false, error: 'No proxy' };
  }

  try {
    const pac = buildTestPac(proxy);
    await chrome.proxy.settings.set({
      value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } },
      scope: 'regular',
    });

    const start = Date.now();
    const res = await fetch('https://ipinfo.io/json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, ip: data.ip, country: data.country, latencyMs };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    await chrome.proxy.settings.clear({ scope: 'regular' });
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
  renderProxyGroups();
  setTimeout(() => {
    attachProxyListeners();
    attachTgProxyListeners();
  }, 50);
  showToast(`Proxy-${newIndex} added`);
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
  renderTgProxyGroups();
  setTimeout(() => {
    attachProxyListeners();
    attachTgProxyListeners();
  }, 50);
  showToast(`TG Proxy-${newIndex} added`);
}

function deleteProxy(idx) {
  const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
  if (proxies.length <= 1) {
    showToast('Cannot delete last proxy');
    return;
  }
  const proxyToDelete = proxies[idx];
  state.proxies = state.proxies.filter(p => p !== proxyToDelete);
  saveState(state);
  renderProxyGroups();
  showToast('Proxy deleted');
}

function deleteTgProxy(idx) {
  const proxies = state.proxies?.filter(p => p.tgUrl) || [];
  if (proxies.length <= 1) {
    showToast('Cannot delete last TG proxy');
    return;
  }
  const proxyToDelete = proxies[idx];
  state.proxies = state.proxies.filter(p => p !== proxyToDelete);
  saveState(state);
  renderTgProxyGroups();
  showToast('TG Proxy deleted');
}

function renderProxyGroups() {
  const container = $('#proxy-groups');
  container.innerHTML = '';
  
  let proxies = state.proxies?.filter(p => !p.tgUrl) || [];
  if (proxies.length === 0) {
    proxies = [{ host: '', port: '', scheme: 'auto', user: '', pass: '', enabled: true, lastTest: null }];
  }
  
  proxies.forEach((proxy, idx) => {
    const section = document.createElement('section');
    section.className = 'block proxy-group';
    section.dataset.index = idx;
    section.dataset.proxyIdx = state.proxies.indexOf(proxy);
    
    const testResult = proxy.lastTest;
    const pingDisplay = testResult?.ok ? `✓ ${testResult.latencyMs}ms` : (testResult?.error || '—');
    
    const labelText = 'Proxy-' + (idx + 1);
    const hostLabel = t.host || 'Host';
    const portLabel = t.port || 'Port';
    const authLabel = t.auth || 'Authentication';
    const optionalText = t.optional || 'optional';
    const userPlaceholder = t.username || 'username';
    const passPlaceholder = t.password || 'password';
    const addBtnText = t.addProxy || '+ Add Proxy';
    
    section.innerHTML = `
      <div class="group-header">
        <span class="group-label">${labelText}</span>
        <span class="ping-result">${pingDisplay}</span>
        <button type="button" class="delete-btn" data-index="${idx}" title="Delete">×</button>
      </div>
      <div class="pill-group">
        <button type="button" data-scheme="auto" class="pill pill-auto ${proxy.scheme === 'auto' ? 'active' : ''}">✥ ${t.auto || 'Auto'}</button>
        <button type="button" data-scheme="http" class="pill ${proxy.scheme === 'http' ? 'active' : ''}">HTTP</button>
        <button type="button" data-scheme="https" class="pill ${proxy.scheme === 'https' ? 'active' : ''}">HTTPS</button>
        <button type="button" data-scheme="socks5" class="pill ${proxy.scheme === 'socks5' ? 'active' : ''}">SOCKS5</button>
        <button type="button" data-scheme="socks4" class="pill ${proxy.scheme === 'socks4' ? 'active' : ''}">SOCKS4</button>
      </div>
      <div class="row">
        <div class="field grow">
          <div class="block-label">${hostLabel}</div>
          <input type="text" class="cfg-host" value="${escapeHtml(proxy.host || '')}" autocomplete="off" />
        </div>
        <div class="field port">
          <div class="block-label">${portLabel}</div>
          <input type="text" class="cfg-port" value="${proxy.port || ''}" autocomplete="off" inputmode="numeric" />
        </div>
      </div>
      <div class="block-label-row">
        <span class="block-label">${authLabel}</span>
        <span class="hint">${optionalText}</span>
      </div>
      <input type="text" class="cfg-user" value="${escapeHtml(proxy.user || '')}" placeholder="${userPlaceholder}" autocomplete="off" />
      <input type="password" class="cfg-pass" value="${escapeHtml(proxy.pass || '')}" placeholder="${passPlaceholder}" autocomplete="off" />
    `;
    container.appendChild(section);
  });
  
  const addSection = document.createElement('section');
  addSection.className = 'block add-group-section';
  addSection.innerHTML = `
    <button type="button" class="add-group-btn" id="add-proxy-group-btn">${addBtnText}</button>
  `;
  container.appendChild(addSection);
}

function attachProxyListeners() {
  document.querySelectorAll('.proxy-group').forEach(group => {
    const proxyIdx = parseInt(group.dataset.proxyIdx);
    const hostInput = group.querySelector('.cfg-host');
    const portInput = group.querySelector('.cfg-port');
    const userInput = group.querySelector('.cfg-user');
    const passInput = group.querySelector('.cfg-pass');

    if (hostInput) {
      hostInput.onchange = () => {
        const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
        const idx = proxies.findIndex(p => state.proxies.indexOf(p) === proxyIdx);
        if (idx >= 0 && state.proxies[idx]) {
          state.proxies[idx].host = hostInput.value.trim();
          saveState(state);
        }
      };
    }
    if (portInput) {
      portInput.onchange = () => {
        const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
        const idx = proxies.findIndex(p => state.proxies.indexOf(p) === proxyIdx);
        if (idx >= 0 && state.proxies[idx]) {
          state.proxies[idx].port = parseInt(portInput.value, 10) || 0;
          saveState(state);
        }
      };
    }
    if (userInput) {
      userInput.onchange = () => {
        const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
        const idx = proxies.findIndex(p => state.proxies.indexOf(p) === proxyIdx);
        if (idx >= 0 && state.proxies[idx]) {
          state.proxies[idx].user = userInput.value;
          saveState(state);
        }
      };
    }
    if (passInput) {
      passInput.onchange = () => {
        const proxies = state.proxies?.filter(p => !p.tgUrl) || [];
        const idx = proxies.findIndex(p => state.proxies.indexOf(p) === proxyIdx);
        if (idx >= 0 && state.proxies[idx]) {
          state.proxies[idx].pass = passInput.value;
          saveState(state);
        }
      };
    }
  });
}

function renderTgProxyGroups() {
  const container = $('#tg-proxy-groups');
  container.innerHTML = '';
  
  let proxies = state.proxies?.filter(p => p.tgUrl) || [];
  if (proxies.length === 0) {
    proxies = [{ tgUrl: '', user: '', pass: '', enabled: true, lastTest: null }];
  }
  
  proxies.forEach((proxy, idx) => {
    const section = document.createElement('section');
    section.className = 'block tg-group';
    section.dataset.index = idx;
    
    const testResult = proxy.lastTest;
    const pingDisplay = testResult?.ok ? `✓ ${testResult.latencyMs}ms` : '';
    
    section.innerHTML = `
      <div class="tg-header">
        <span class="group-label">TG Proxy-${idx + 1}</span>
        <span class="ping-result">${pingDisplay}</span>
        <button type="button" class="delete-btn" data-index="${idx}" title="Delete">×</button>
      </div>
      <input type="text" class="cfg-tg-url" value="${escapeHtml(proxy.tgUrl || '')}" placeholder="tg://proxy?server=...&port=..." autocomplete="off" />
      <div class="block-label-row">
        <span class="block-label">Authentication</span>
        <span class="hint">optional</span>
      </div>
      <input type="text" class="cfg-tg-user" value="${escapeHtml(proxy.user || '')}" placeholder="username" autocomplete="off" />
      <input type="password" class="cfg-tg-pass" value="${escapeHtml(proxy.pass || '')}" placeholder="password" autocomplete="off" />
    `;
    container.appendChild(section);
  });
  
  const addSection = document.createElement('section');
  addSection.className = 'block add-group-section';
  addSection.innerHTML = `
    <button type="button" class="add-group-btn" id="add-tg-group-btn">+ Add TG Proxy</button>
  `;
  container.appendChild(addSection);
}

function renderSettings() {
  ensureProxyObject();
  renderProxyGroups();
  renderTgProxyGroups();
  attachProxyListeners();
  attachTgProxyListeners();
  $('#test-result').hidden = true;
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
  if (state.activeProxyIndex < 0 || state.activeProxyIndex >= state.proxies.length) {
    state.activeProxyIndex = 0;
  }
  state.proxy = state.proxies[state.activeProxyIndex];
  if (!state.proxy) {
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
}

init();
