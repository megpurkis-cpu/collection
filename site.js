let CONSOLES = [];
let CURRENT_CONSOLE = null;
let ALL_GAMES = [];
let GAMES = [];
let SORT_KEY = 'title';
let SORT_DIR = 1;

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const passcodeInput = document.getElementById('passcode-input');
const unlockBtn = document.getElementById('unlock-btn');
const gateError = document.getElementById('gate-error');

async function tryUnlock() {
  gateError.textContent = '';
  const val = passcodeInput.value.trim();
  if (!val) return;
  try {
    const auth = await loadAuthConfig('data/auth.json');
    const hash = await sha256Hex(val);
    if (hash === auth.siteHash) {
      setUnlocked('site');
      showApp();
    } else {
      gateError.textContent = 'Incorrect passcode.';
      passcodeInput.value = '';
    }
  } catch (e) {
    gateError.textContent = 'Could not check passcode — try reloading.';
  }
}

unlockBtn.addEventListener('click', tryUnlock);
passcodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

function showApp() {
  gate.style.display = 'none';
  app.style.display = 'block';
  boot();
}

if (isUnlocked('site')) {
  showApp();
}

// ---------- App boot ----------

async function boot() {
  const [consolesRes, gamesRes] = await Promise.all([
    fetch('data/consoles.json', { cache: 'no-store' }),
    fetch('data/games.json', { cache: 'no-store' }),
  ]);
  CONSOLES = await consolesRes.json();
  ALL_GAMES = await gamesRes.json();
  renderConsolePicker();
  const active = CONSOLES.find(c => c.active) || CONSOLES[0];
  loadConsole(active.id);
}

function renderConsolePicker() {
  const picker = document.getElementById('console-picker');
  picker.innerHTML = CONSOLES.map(c =>
    `<option value="${c.id}" ${c.active ? '' : 'disabled'}>${c.name}${c.active ? '' : ' (coming soon)'}</option>`
  ).join('');
  if (CURRENT_CONSOLE) picker.value = CURRENT_CONSOLE;
  picker.onchange = () => loadConsole(picker.value);
}

function loadConsole(id) {
  const console_ = CONSOLES.find(c => c.id === id);
  if (!console_ || !console_.active) return;
  CURRENT_CONSOLE = id;
  document.body.dataset.theme = id;
  renderConsolePicker();
  GAMES = ALL_GAMES.filter(g => g.console === id);
  render();
}

// ---------- Filtering / rendering ----------

const searchInput = document.getElementById('search-input');
const filterOwned = document.getElementById('filter-owned');
const filterManual = document.getElementById('filter-manual');
const filterBoxed = document.getElementById('filter-boxed');
[searchInput, filterOwned, filterManual, filterBoxed].forEach(el => el.addEventListener('input', render));

document.querySelectorAll('.game-table thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (SORT_KEY === key) { SORT_DIR *= -1; } else { SORT_KEY = key; SORT_DIR = 1; }
    render();
  });
});

function triStateVal(v) {
  return v === true ? 'yes' : v === false ? 'no' : 'unknown';
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const ownedFilter = filterOwned.value;
  const manualFilter = filterManual.value;
  const boxedFilter = filterBoxed.value;

  let rows = GAMES.filter(g => {
    if (q && !g.title.toLowerCase().includes(q)) return false;
    if (ownedFilter === 'owned' && !g.owned) return false;
    if (ownedFilter === 'wishlist' && g.owned) return false;
    if (manualFilter !== 'all' && triStateVal(g.manual) !== manualFilter) return false;
    if (boxedFilter !== 'all' && triStateVal(g.boxed) !== boxedFilter) return false;
    return true;
  });

  rows.sort((a, b) => {
    let av, bv;
    if (SORT_KEY === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    else if (SORT_KEY === 'condition') { av = a.condition || ''; bv = b.condition || ''; }
    else { av = String(triStateVal(a[SORT_KEY])); bv = String(triStateVal(b[SORT_KEY])); }
    if (av < bv) return -1 * SORT_DIR;
    if (av > bv) return 1 * SORT_DIR;
    return 0;
  });

  const tbody = document.getElementById('game-rows');
  tbody.innerHTML = '';
  rows.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="game-title">${escapeHtml(g.title)}${g.owned ? '' : ' <span class="pill unknown">wishlist</span>'}</td>
      <td class="condition-badge">${g.condition ? escapeHtml(g.condition) : '—'}</td>
      <td>${pill(g.manual, 'Yes', 'No')}</td>
      <td>${pill(g.boxed, 'Yes', 'No')}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('empty-state').style.display = rows.length ? 'none' : 'block';

  const owned = GAMES.filter(g => g.owned).length;
  const withManual = GAMES.filter(g => g.owned && g.manual === true).length;
  const boxed = GAMES.filter(g => g.owned && g.boxed === true).length;
  document.getElementById('stats-row').innerHTML = `
    <span><strong>${GAMES.length}</strong> titles</span>
    <span><strong>${owned}</strong> owned</span>
    <span><strong>${withManual}</strong> with manual</span>
    <span><strong>${boxed}</strong> boxed</span>
    <span><strong>${rows.length}</strong> shown</span>
  `;
}

function pill(val, yesLabel, noLabel) {
  if (val === true) return `<span class="pill yes">${yesLabel}</span>`;
  if (val === false) return `<span class="pill no">${noLabel}</span>`;
  return `<span class="pill unknown">Unrecorded</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
