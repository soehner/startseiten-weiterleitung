const $ = id => document.getElementById(id);
let detected = { host: '', user: '' };

async function render() {
  const s = await loadSettings();
  $('enabled').checked = s.enabled;
  $('stateText').textContent = s.enabled ? 'Weiterleitung aktiv' : 'Weiterleitung deaktiviert';
  $('stateText').className = s.enabled ? 'on' : 'off';
}

async function inspectTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    $('host').textContent = '(keine Webseite)';
    return;
  }
  const url = new URL(tab.url);
  detected.host = url.hostname;
  $('host').textContent = url.hostname;

  const s = await loadSettings();
  const hostRules = s.rules.filter(r => hostMatches(r.domain, url.hostname));
  const custom = hostRules.find(r => r.selector || r.regex) || {};

  $('user').textContent = 'wird ermittelt …';
  const info = await detectInTab(tab.id, custom.selector, custom.regex);
  if (!info) {
    $('user').textContent = 'kein Zugriff auf die Seite';
  } else if (!info.found) {
    $('user').textContent = 'nicht erkannt';
  } else if (isGuest(info)) {
    $('user').textContent = 'nicht angemeldet (Gast)';
  } else {
    const names = [info.custom, info.wikiName, info.userName].filter(Boolean);
    detected.user = info.custom || info.wikiName || info.userName || '';
    $('user').textContent = [...new Set(names)].join(' / ') + ` (${info.source})`;
    $('addRule').disabled = false;
  }

  const rule = findMatchingRule(s, url.hostname, info);
  if (rule) {
    $('rule').textContent = `→ ${rule.target}`;
  } else if (hostRules.length) {
    $('rule').textContent = `${hostRules.length} Regel(n) für Domain, keine passt zum Benutzer`;
  } else {
    $('rule').textContent = 'keine';
  }
}

$('enabled').addEventListener('change', async e => {
  await api.storage.sync.set({ enabled: e.target.checked });
  render();
});

$('options').addEventListener('click', () => {
  api.runtime.openOptionsPage();
  window.close();
});

$('addRule').addEventListener('click', () => {
  const q = new URLSearchParams({ domain: detected.host, user: detected.user });
  api.tabs.create({ url: api.runtime.getURL('src/options.html') + '?' + q });
  window.close();
});

$('reset').addEventListener('click', async () => {
  const n = await clearDoneFlags(detected.host || '');
  $('msg').textContent = n
    ? 'Zurückgesetzt – beim nächsten Seitenaufruf wird wieder umgeleitet.'
    : 'Es war kein Merker gesetzt.';
});

(async () => {
  try {
    const cmds = await api.commands.getAll();
    const c = cmds.find(x => x.name === 'toggle-enabled');
    if (c) $('shortcut').textContent = c.shortcut || '(nicht belegt)';
  } catch (e) { /* ignorieren */ }
  await render();
  await inspectTab();
})();
