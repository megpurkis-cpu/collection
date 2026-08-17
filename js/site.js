let CONSOLES = [];
let CURRENT_CONSOLE = null;
let ALL_GAMES = [];
let GAMES = [];
let HARDWARE = null; // lazy-loaded on first switch to the Consoles view
let VIEW = 'games';
let SORT_KEY = 'title';
let SORT_DIR = 1;
let HSORT_KEY = 'title';
let HSORT_DIR = 1;

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
  renderGrandTotal();
  const active = CONSOLES.find(c => c.active) || CONSOLES[0];
  loadConsole(active.id);

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function renderGrandTotal() {
  const total = ALL_GAMES.filter(g => g.owned && g.price != null).reduce((s, g) => s + Number(g.price), 0);
  document.getElementById('grand-total').innerHTML = `<strong>${formatPrice(total)}</strong> collection value`;
}

async function switchView(view) {
  VIEW = view;
  document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const picker = document.getElementById('console-picker');
  const gamesTable = document.getElementById('games-table');
  const hardwareTable = document.getElementById('hardware-table');
  const filterOwnedLabel = document.getElementById('filter-owned');

  if (view === 'hardware') {
    picker.style.display = 'none';
    gamesTable.style.display = 'none';
    hardwareTable.style.display = '';
    document.body.dataset.theme = 'xbox'; // neutral default theme for the hardware view
    if (HARDWARE === null) {
      const res = await fetch('data/hardware.json', { cache: 'no-store' });
      HARDWARE = await res.json();
    }
    renderHardware();
  } else {
    picker.style.display = '';
    gamesTable.style.display = '';
    hardwareTable.style.display = 'none';
    document.body.dataset.theme = CURRENT_CONSOLE;
    render();
  }
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
const searchClear = document.getElementById('search-clear');
const filterOwned = document.getElementById('filter-owned');
const filterManual = document.getElementById('filter-manual');
const filterBoxed = document.getElementById('filter-boxed');
[searchInput, filterOwned, filterManual, filterBoxed].forEach(el => el.addEventListener('input', () => {
  if (VIEW === 'hardware') renderHardware(); else render();
}));

searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchInput.focus();
  if (VIEW === 'hardware') renderHardware(); else render();
});

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
    else if (SORT_KEY === 'price') { av = a.price == null ? -1 : Number(a.price); bv = b.price == null ? -1 : Number(b.price); }
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
      <td class="condition-badge">${formatPrice(g.price)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('empty-state').style.display = rows.length ? 'none' : 'block';
  if (!rows.length && q) {
    renderEmptyState(q);
  } else if (!rows.length) {
    document.getElementById('empty-state').innerHTML = 'No games match those filters.';
  }

  const owned = GAMES.filter(g => g.owned).length;
  const withManual = GAMES.filter(g => g.owned && g.manual === true).length;
  const boxed = GAMES.filter(g => g.owned && g.boxed === true).length;
  const totalValue = GAMES.filter(g => g.owned && g.price != null).reduce((sum, g) => sum + Number(g.price), 0);
  document.getElementById('stats-row').innerHTML = `
    <span><strong>${GAMES.length}</strong> titles</span>
    <span><strong>${owned}</strong> owned</span>
    <span><strong>${withManual}</strong> with manual</span>
    <span><strong>${boxed}</strong> boxed</span>
    <span><strong>${formatPrice(totalValue)}</strong> est. CEX value</span>
    <span><strong>${rows.length}</strong> shown</span>
  `;
}

function formatPrice(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return '—';
  return '£' + n.toFixed(2);
}

// Best-effort platform keyword matching and checkCexPrice() now live in
// js/cex.js (shared with the admin panel) — loaded via a separate <script>
// tag in index.html before this file.

function renderEmptyState(query) {
  const el = document.getElementById('empty-state');
  const consoleName = (CONSOLES.find(c => c.id === CURRENT_CONSOLE) || {}).name || 'this console';
  el.innerHTML = `
    <div>No games match "${escapeHtml(query)}" in ${escapeHtml(consoleName)}.</div>
    <button class="btn-ghost" id="cex-check-btn" style="width:auto;padding:9px 16px;margin-top:12px;">
      Check CEX price for "${escapeHtml(query)}"
    </button>
    <div id="cex-check-result" style="margin-top:10px;"></div>
  `;
  document.getElementById('cex-check-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    const resultEl = document.getElementById('cex-check-result');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const fallbackLink = `<a href="https://uk.webuy.com/search?stext=${encodeURIComponent(query)}" target="_blank" rel="noopener" class="cex-link" style="display:inline-block;">Search CEX manually ↗</a>`;
    try {
      const match = await checkCexPrice(query, CURRENT_CONSOLE);
      if (match) {
        resultEl.innerHTML = `<span class="pill yes">${formatPrice(match.cashPrice)} cash</span> &nbsp; ${escapeHtml(match.boxName)} &nbsp; ${fallbackLink}`;
      } else {
        resultEl.innerHTML = `Couldn't find a confident match for this console on CEX. ${fallbackLink}`;
      }
    } catch (err) {
      resultEl.innerHTML = `CEX won't let this site ask directly. ${fallbackLink}`;
    }
    btn.textContent = 'Check again';
    btn.disabled = false;
  });
}

function renderHardware() {
  const q = searchInput.value.trim().toLowerCase();
  const ownedFilter = filterOwned.value;
  const manualFilter = filterManual.value;
  const boxedFilter = filterBoxed.value;

  let rows = HARDWARE.filter(h => {
    const haystack = `${h.title} ${h.variation || ''}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (ownedFilter === 'owned' && !h.owned) return false;
    if (ownedFilter === 'wishlist' && h.owned) return false;
    if (manualFilter !== 'all' && triStateVal(h.manual) !== manualFilter) return false;
    if (boxedFilter !== 'all' && triStateVal(h.boxed) !== boxedFilter) return false;
    return true;
  });

  rows.sort((a, b) => {
    let av, bv;
    if (HSORT_KEY === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    else if (HSORT_KEY === 'variation') { av = (a.variation || '').toLowerCase(); bv = (b.variation || '').toLowerCase(); }
    else if (HSORT_KEY === 'condition') { av = a.condition || ''; bv = b.condition || ''; }
    else if (HSORT_KEY === 'price') { av = a.price == null ? -1 : Number(a.price); bv = b.price == null ? -1 : Number(b.price); }
    else { av = String(triStateVal(a[HSORT_KEY])); bv = String(triStateVal(b[HSORT_KEY])); }
    if (av < bv) return -1 * HSORT_DIR;
    if (av > bv) return 1 * HSORT_DIR;
    return 0;
  });

  const tbody = document.getElementById('hardware-rows');
  tbody.innerHTML = '';
  rows.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="game-title">${escapeHtml(h.title)}${h.owned ? '' : ' <span class="pill unknown">wishlist</span>'}</td>
      <td class="condition-badge">${h.variation ? escapeHtml(h.variation) : '—'}</td>
      <td class="condition-badge">${h.condition ? escapeHtml(h.condition) : '—'}</td>
      <td>${pill(h.manual, 'Yes', 'No')}</td>
      <td>${pill(h.boxed, 'Yes', 'No')}</td>
      <td class="condition-badge">${formatPrice(h.price)}</td>
    `;
    tbody.appendChild(tr);
  });

  const empty = document.getElementById('empty-state');
  empty.style.display = rows.length ? 'none' : 'block';
  if (!rows.length) {
    empty.innerHTML = HARDWARE.length
      ? `No consoles match "${escapeHtml(q)}".`
      : `No consoles added yet — add them from the admin panel.`;
  }

  const owned = HARDWARE.filter(h => h.owned).length;
  const totalValue = HARDWARE.filter(h => h.owned && h.price != null).reduce((s, h) => s + Number(h.price), 0);
  document.getElementById('stats-row').innerHTML = `
    <span><strong>${HARDWARE.length}</strong> consoles listed</span>
    <span><strong>${owned}</strong> owned</span>
    <span><strong>${formatPrice(totalValue)}</strong> est. CEX value</span>
    <span><strong>${rows.length}</strong> shown</span>
  `;
}

document.querySelectorAll('#hardware-table thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.hsort;
    if (HSORT_KEY === key) { HSORT_DIR *= -1; } else { HSORT_KEY = key; HSORT_DIR = 1; }
    if (VIEW === 'hardware') renderHardware();
  });
});

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
