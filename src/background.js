/*
 * Hintergrund-Skript: prüft geladene Seiten und leitet bei passender Regel weiter.
 * Chrome lädt diese Datei als Service Worker (common.js per importScripts),
 * Firefox als Event-Page (common.js über manifest "scripts").
 */
if (typeof importScripts === 'function' && typeof loadSettings === 'undefined') {
  importScripts('common.js');
}

const busyTabs = new Set();
const lastRedirect = new Map(); // tabId -> Zeitstempel (Schleifenschutz)

api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Normales Laden ("complete") oder URL-Wechsel innerhalb der Single-Page-App
  const loaded = changeInfo.status === 'complete' || (changeInfo.url && tab.status === 'complete');
  if (!loaded || !tab.url) return;
  handleTab(tabId, tab.url).catch(e => console.warn('[Startseiten-Weiterleitung]', e));
});

api.tabs.onRemoved.addListener(tabId => {
  busyTabs.delete(tabId);
  lastRedirect.delete(tabId);
});

async function handleTab(tabId, url) {
  const settings = await loadSettings();
  if (!settings.enabled) return;

  let u;
  try { u = new URL(url); } catch (e) { return; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return;

  const rules = settings.rules.filter(r =>
    r.enabled !== false && r.domain && r.target && hostMatches(r.domain, u.hostname));
  if (!rules.length) return;

  if (busyTabs.has(tabId)) return;
  const last = lastRedirect.get(tabId);
  if (last && Date.now() - last < 5000) return; // gerade erst umgeleitet
  busyTabs.add(tabId);

  try {
    const cache = new Map();
    for (const rule of rules) {
      const key = (rule.selector || '') + '\u0000' + (rule.regex || '');
      if (!cache.has(key)) cache.set(key, await detectInTab(tabId, rule.selector, rule.regex));
      const info = cache.get(key);
      if (!info || !info.found) continue;

      // Abgemeldet -> Merker zurücksetzen, damit nach dem nächsten Login wieder umgeleitet wird.
      if (isGuest(info)) { await clearDoneFlags(u.hostname); return; }
      if (!userMatches(rule, info)) continue;

      const target = resolveTarget(rule.target, u.href);
      if (!target) continue;

      const user = userCandidates(info)[0] || 'unbekannt';
      const doneKey = `done:${u.hostname}:${user}`;

      if (sameUrl(target, u.href)) {
        await api.storage.session.set({ [doneKey]: Date.now() });
        return;
      }

      if ((rule.mode || 'login') === 'home') {
        if (!isHomePage(u, info, rule.homePattern)) return;
      } else {
        const got = await api.storage.session.get(doneKey);
        if (got[doneKey]) return; // in dieser Anmeldung schon umgeleitet
      }

      await api.storage.session.set({ [doneKey]: Date.now() });
      lastRedirect.set(tabId, Date.now());
      await api.tabs.update(tabId, { url: target });
      return;
    }
  } finally {
    busyTabs.delete(tabId);
  }
}

/* ---------- Ein/Aus: Tastenkürzel + Badge ---------- */

api.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-enabled') return;
  const s = await loadSettings();
  await api.storage.sync.set({ enabled: !s.enabled });
});

async function updateBadge() {
  const s = await loadSettings();
  await api.action.setBadgeBackgroundColor({ color: '#c62828' });
  await api.action.setBadgeText({ text: s.enabled ? '' : 'AUS' });
  await api.action.setTitle({
    title: `Startseiten-Weiterleitung: ${s.enabled ? 'aktiv' : 'deaktiviert'}`
  });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) updateBadge();
});

api.runtime.onStartup.addListener(updateBadge);

api.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    const s = await loadSettings();
    if (!s.rules.length) {
      await saveSettings({
        enabled: true,
        rules: [{
          id: String(Date.now()),
          enabled: false,
          domain: 'firma.ariadne.cloud',
          user: 'MaxMustermann',
          target: '/Main/WebHome',
          mode: 'login',
          selector: '',
          regex: '',
          homePattern: ''
        }]
      });
    }
    api.runtime.openOptionsPage();
  }
  updateBadge();
});

updateBadge();
