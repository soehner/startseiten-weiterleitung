const $ = id => document.getElementById(id);
const FIELDS = ['enabled', 'domain', 'user', 'target', 'mode', 'selector', 'regex', 'homePattern'];

function newRule(partial = {}) {
  return {
    id: String(Date.now()) + Math.random().toString(16).slice(2, 6),
    enabled: true, domain: '', user: '', target: '', mode: 'login',
    selector: '', regex: '', homePattern: '',
    ...partial
  };
}

function addRuleCard(rule) {
  const node = $('ruleTpl').content.firstElementChild.cloneNode(true);
  node.dataset.id = rule.id;
  for (const f of FIELDS) {
    const el = node.querySelector(`[data-f="${f}"]`);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = rule[f] !== false;
    else el.value = rule[f] || (f === 'mode' ? 'login' : '');
  }
  node.querySelector('[data-f="homePattern"]').placeholder = DEFAULT_HOME_PATTERN;
  node.querySelector('.remove').addEventListener('click', () => {
    node.remove();
    showMsg('Regel entfernt – zum Übernehmen „Speichern“ klicken.');
  });
  $('rules').appendChild(node);
  return node;
}

function collectRules() {
  return [...document.querySelectorAll('#rules .rule')].map(node => {
    const r = { id: node.dataset.id };
    for (const f of FIELDS) {
      const el = node.querySelector(`[data-f="${f}"]`);
      r[f] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    r.domain = normalizeDomain(r.domain);
    return r;
  });
}

function validate(rules) {
  const errors = [];
  rules.forEach((r, i) => {
    const n = `Regel ${i + 1}`;
    if (!r.domain) errors.push(`${n}: Domain fehlt.`);
    if (!r.user) errors.push(`${n}: Benutzer fehlt.`);
    if (!r.target) errors.push(`${n}: Ziel-Seite fehlt.`);
    else if (r.domain && !resolveTarget(r.target, `https://${r.domain.replace(/^\*\./, '')}/`)) {
      errors.push(`${n}: Ziel-Seite ist keine gültige Adresse.`);
    }
    for (const f of ['regex', 'homePattern']) {
      if (r[f]) { try { new RegExp(r[f]); } catch (e) { errors.push(`${n}: ungültiger regulärer Ausdruck (${f}).`); } }
    }
  });
  return errors;
}

function showMsg(text, type = '') {
  $('msg').textContent = text;
  $('msg').className = 'msg ' + type;
}

async function renderPermissionWarnings() {
  for (const node of document.querySelectorAll('#rules .rule')) {
    const domain = normalizeDomain(node.querySelector('[data-f="domain"]').value);
    let ok = true;
    if (domain) {
      try { ok = await api.permissions.contains({ origins: [originForDomain(domain)] }); } catch (e) { ok = false; }
    }
    node.querySelector('.perm-warning').hidden = ok;
  }
}

function renderState(enabled) {
  $('enabled').checked = enabled;
  $('stateText').textContent = enabled ? 'Weiterleitung aktiv' : 'Weiterleitung deaktiviert';
  $('stateText').className = enabled ? 'on' : 'off';
}

/* ---------- Ereignisse ---------- */

$('enabled').addEventListener('change', async e => {
  await api.storage.sync.set({ enabled: e.target.checked });
  renderState(e.target.checked);
});

$('add').addEventListener('click', () => {
  addRuleCard(newRule()).querySelector('[data-f="domain"]').focus();
});

// Wichtig: permissions.request muss (v. a. in Firefox) direkt im Klick-Handler
// aufgerufen werden – daher kein await davor.
$('save').addEventListener('click', () => {
  const rules = collectRules();
  const errors = validate(rules);
  if (errors.length) { showMsg(errors.join(' '), 'error'); return; }

  const origins = [...new Set(rules.map(r => originForDomain(r.domain)))];
  const request = origins.length
    ? api.permissions.request({ origins }).catch(() => false)
    : Promise.resolve(true);

  request.then(async granted => {
    await api.storage.sync.set({ rules });
    await renderPermissionWarnings();
    showMsg(granted
      ? 'Gespeichert.'
      : 'Gespeichert – aber der Zugriff auf die Domain(s) wurde nicht erlaubt. Ohne diese Berechtigung funktioniert die Weiterleitung nicht.',
      granted ? 'ok' : 'error');
  });
});

$('export').addEventListener('click', async () => {
  const s = await loadSettings();
  const blob = new Blob([JSON.stringify({ rules: s.rules }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'startseiten-weiterleitung.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const rules = Array.isArray(data) ? data : data.rules;
    if (!Array.isArray(rules)) throw new Error('Keine Regeln gefunden');
    $('rules').innerHTML = '';
    rules.forEach(r => addRuleCard(newRule(r)));
    showMsg(`${rules.length} Regel(n) geladen – zum Übernehmen „Speichern“ klicken.`, 'ok');
  } catch (err) {
    showMsg('Import fehlgeschlagen: ' + err.message, 'error');
  }
  e.target.value = '';
});

/* ---------- Start ---------- */

(async () => {
  const s = await loadSettings();
  renderState(s.enabled);
  s.rules.forEach(r => addRuleCard(newRule(r)));

  // Aufruf aus dem Popup: "Regel für diese Seite anlegen"
  const q = new URLSearchParams(location.search);
  if (q.get('domain')) {
    const card = addRuleCard(newRule({ domain: q.get('domain'), user: q.get('user') || '' }));
    card.scrollIntoView({ behavior: 'smooth' });
    card.querySelector('[data-f="target"]').focus();
    showMsg('Neue Regel vorbelegt – Ziel-Seite eintragen und „Speichern“ klicken.');
  } else if (!s.rules.length) {
    addRuleCard(newRule());
  }
  renderPermissionWarnings();
})();

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) renderState(changes.enabled.newValue !== false);
});
