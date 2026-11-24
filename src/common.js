/*
 * Gemeinsame Funktionen für Hintergrund-Skript, Popup und Einstellungsseite.
 * Läuft in Chrome/Edge/Brave/Opera (chrome.*) und Firefox (browser.*).
 */
/* eslint-disable no-unused-vars */
const api = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = { enabled: true, rules: [] };
const GUEST_NAMES = ['wikiguest', 'guest', 'gast', 'anonymous', 'unknownuser'];
// Pfade, die als "Startseite der Domain" gelten (Modus "home"): /, /Main, /Main/WebHome, /bin/view/Main/WebHome …
const DEFAULT_HOME_PATTERN = '^/(bin/view/?)?(Main/?(WebHome/?)?)?$';

async function loadSettings() {
  const s = await api.storage.sync.get(DEFAULT_SETTINGS);
  return {
    enabled: s.enabled !== false,
    rules: Array.isArray(s.rules) ? s.rules : []
  };
}

function saveSettings(settings) {
  return api.storage.sync.set(settings);
}

/** "https://foo.example.com/x" -> "foo.example.com"; "*.example.com" bleibt erhalten. */
function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return '';
  if (d.includes('://')) {
    try { d = new URL(d).hostname; } catch (e) { d = d.replace(/^[a-z]+:\/\//, ''); }
  }
  return d.replace(/\/.*$/, '').replace(/:\d+$/, '');
}

/** Exakter Host oder Platzhalter "*.example.com" (passt auch auf example.com selbst). */
function hostMatches(pattern, host) {
  const p = normalizeDomain(pattern);
  const h = String(host || '').toLowerCase();
  if (!p || !h) return false;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith('.' + base);
  }
  return h === p;
}

/** Host-Berechtigungsmuster für eine Domain. */
function originForDomain(domain) {
  const d = normalizeDomain(domain);
  return `*://${d}/*`;
}

/** "Main.MaxMustermann" -> "maxmustermann" */
function normalizeUser(u) {
  return String(u || '').trim().replace(/^main\./i, '').toLowerCase();
}

function splitUsers(str) {
  return String(str || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
}

/** Alle erkannten Namensvarianten (WikiName, Login-Name, …), normalisiert. */
function userCandidates(info) {
  if (!info) return [];
  const list = [info.custom, info.wikiName, info.userName, info.wikiUserName]
    .filter(Boolean)
    .map(normalizeUser)
    .filter(Boolean);
  return [...new Set(list)];
}

/** Gast = Seite liefert Benutzerinfos, aber es ist niemand angemeldet. */
function isGuest(info) {
  if (!info || !info.found) return false;
  const c = userCandidates(info);
  return c.length === 0 || c.every(n => GUEST_NAMES.includes(n));
}

function userMatches(rule, info) {
  if (!info || !info.found || isGuest(info)) return false;
  const wanted = splitUsers(rule.user).map(normalizeUser);
  if (wanted.includes('*')) return true;
  const have = userCandidates(info);
  return have.some(n => wanted.includes(n));
}

/** Ziel kann absolut ("https://…") oder relativ zur Domain ("/Main/MeineSeite") sein. */
function resolveTarget(target, currentUrl) {
  try { return new URL(String(target).trim(), currentUrl).href; } catch (e) { return null; }
}

function sameUrl(a, b) {
  const norm = x => {
    try {
      const u = new URL(x);
      u.hash = '';
      return u.href.replace(/\/$/, '');
    } catch (e) { return x; }
  };
  return norm(a) === norm(b);
}

function isHomePath(url, pattern) {
  try {
    return new RegExp(pattern || DEFAULT_HOME_PATTERN, 'i').test(url.pathname);
  } catch (e) {
    return new RegExp(DEFAULT_HOME_PATTERN, 'i').test(url.pathname);
  }
}

/**
 * Ist die geladene Seite die Startseite der Domain?
 * Neuere Q.wiki-Versionen leiten "/" bzw. Main.WebHome auf /content/<uuid>?redirectedfrom=Main.WebHome um.
 */
function isHomePage(url, info, pattern) {
  if (isHomePath(url, pattern)) return true;
  const from = url.searchParams.get('redirectedfrom');
  if (from && /^(Main(\.WebHome)?|WebHome)$/i.test(from)) return true;
  if (info && info.web && info.topic && /^main$/i.test(info.web) && /^webhome$/i.test(info.topic)) return true;
  return false;
}

/** Erste aktive Regel, die zu Host + Benutzer passt. */
function findMatchingRule(settings, host, info) {
  return settings.rules.find(r =>
    r.enabled !== false && r.domain && r.target &&
    hostMatches(r.domain, host) && userMatches(r, info)) || null;
}

async function clearDoneFlags(host) {
  const all = await api.storage.session.get(null);
  const prefix = host ? `done:${host}:` : 'done:';
  const keys = Object.keys(all).filter(k => k.startsWith(prefix));
  if (keys.length) await api.storage.session.remove(keys);
  return keys.length;
}

/**
 * Wird per scripting.executeScript IN DIE SEITE injiziert – muss deshalb
 * vollständig eigenständig sein (keine Verweise auf andere Funktionen).
 *
 * Erkennung (in dieser Reihenfolge):
 *  1. Foswiki/Q.wiki: <script class="foswikiPreferences" type="text/json">{"WIKINAME": …, "USERNAME": …}</script>
 *  2. Meta-Tags <meta name="foswiki.WIKINAME" content="…">
 *  3. optional: eigener CSS-Selektor (Text/Attribut "content"/Wert des Elements)
 *  4. optional: eigener regulärer Ausdruck auf den HTML-Quelltext (Gruppe 1)
 */
async function detectUser(selector, regex) {
  const read = () => {
    const r = { found: false, wikiName: null, userName: null, wikiUserName: null, custom: null, web: null, topic: null, source: null };
    const scripts = document.querySelectorAll(
      'script.foswikiPreferences, script[type="text/json"], script[type="application/json"]');
    for (const el of scripts) {
      let j;
      try { j = JSON.parse(el.textContent); } catch (e) { continue; }
      if (j && typeof j === 'object' && ('WIKINAME' in j || 'USERNAME' in j)) {
        r.found = true;
        r.wikiName = j.WIKINAME || null;
        r.userName = j.USERNAME || null;
        r.wikiUserName = j.WIKIUSERNAME || null;
        r.web = j.BASEWEB || j.WEB || null;
        r.topic = j.BASETOPIC || j.TOPIC || null;
        r.source = 'Foswiki-Preferences';
        break;
      }
    }
    if (!r.found) {
      const meta = n => {
        const m = document.querySelector(`meta[name="foswiki.${n}"]`);
        return m ? m.getAttribute('content') : null;
      };
      const w = meta('WIKINAME'), u = meta('USERNAME');
      if (w || u) {
        r.found = true; r.wikiName = w; r.userName = u;
        r.wikiUserName = meta('WIKIUSERNAME'); r.source = 'Meta-Tags';
      }
    }
    if (selector) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const v = (el.getAttribute('content') || el.value || el.textContent || '').trim();
          if (v) { r.custom = v; r.found = true; r.source = r.source || 'CSS-Selektor'; }
        }
      } catch (e) { /* ungültiger Selektor */ }
    }
    if (regex) {
      try {
        const m = document.documentElement.outerHTML.match(new RegExp(regex));
        if (m) { r.custom = (m[1] || m[0]).trim(); r.found = true; r.source = r.source || 'Regulärer Ausdruck'; }
      } catch (e) { /* ungültiger Ausdruck */ }
    }
    return r;
  };
  // Kurz warten, falls die Seite die Infos erst nachlädt (max. ~3 s).
  for (let i = 0; i < 10; i++) {
    const r = read();
    if (r.found) return r;
    await new Promise(res => setTimeout(res, 300));
  }
  return read();
}

async function detectInTab(tabId, selector, regex) {
  try {
    const [res] = await api.scripting.executeScript({
      target: { tabId },
      func: detectUser,
      args: [selector || '', regex || '']
    });
    return (res && res.result) || null;
  } catch (e) {
    return null; // keine Berechtigung, PDF, interne Seite …
  }
}
