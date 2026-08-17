// Guard: must have passed the admin password gate and have GitHub details saved.
if (!isUnlocked('admin') || !localStorage.getItem('collection_gh_token')) {
  window.location.href = 'index.html';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('collection_admin_unlocked');
  localStorage.removeItem('collection_gh_owner');
  localStorage.removeItem('collection_gh_repo');
  localStorage.removeItem('collection_gh_token');
  window.location.href = 'index.html';
});

// ---------- Panel switching ----------

const panels = { games: 'panel-games', hardware: 'panel-hardware', 'add-console': 'panel-add-console', settings: 'panel-settings' };
document.querySelectorAll('.console-tab[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.console-tab[data-panel]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(panels).forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById(panels[btn.dataset.panel]).style.display = 'block';
  });
});

// ---------- State ----------
// All games for every console live in one file, data/games.json, each
// tagged with a "console" field. We load it once, edit a filtered view,
// and always save the whole array back so other consoles' data is kept.

let consoles = [];
let consolesSha = null;
let currentConsoleId = null;
let allGames = [];
let gamesSha = null;
let dirty = false;
let hardware = [];
let hardwareSha = null;
let hwDirty = false;

const consoleSelect = document.getElementById('console-select');
const adminSearch = document.getElementById('admin-search');
const rowsEl = document.getElementById('admin-rows');
const saveStatus = document.getElementById('save-status');

adminSearch.addEventListener('input', renderRows);

async function init() {
  saveStatus.textContent = 'Loading…';
  try {
    const [consolesFile, gamesFile, hardwareFile] = await Promise.all([
      ghGetFile('data/consoles.json'),
      ghGetFile('data/games.json'),
      ghGetFile('data/hardware.json'),
    ]);
    consoles = consolesFile.content || [];
    consolesSha = consolesFile.sha;
    allGames = gamesFile.content || [];
    gamesSha = gamesFile.sha;
    hardware = hardwareFile.content || [];
    hardwareSha = hardwareFile.sha;

    consoleSelect.innerHTML = consoles.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    currentConsoleId = consoles[0] && consoles[0].id;
    dirty = false;
    renderRows();
    renderHardwareAdmin();
    saveStatus.textContent = '';
  } catch (e) {
    saveStatus.textContent = 'Could not load from GitHub — check your token and repo name, or log out and back in.';
    console.error(e);
  }
}

consoleSelect.addEventListener('change', () => {
  currentConsoleId = consoleSelect.value;
  adminSearch.value = '';
  renderRows();
});

function currentGames() {
  return allGames.filter(g => g.console === currentConsoleId);
}

function renderRows() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = allGames
    .map((g, idx) => ({ g, idx }))
    .filter(({ g }) => g.console === currentConsoleId && (!q || g.title.toLowerCase().includes(q)));

  const totalForConsole = allGames.filter(g => g.console === currentConsoleId).length;
  document.getElementById('admin-stats').innerHTML =
    `<span><strong>${totalForConsole}</strong> total</span><span><strong>${filtered.length}</strong> shown</span>`;

  rowsEl.innerHTML = '';
  filtered.forEach(({ g, idx }) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <span class="game-title">${escapeHtml(g.title)}</span>
      <button class="toggle ${g.owned ? 'on' : ''}" data-idx="${idx}" data-field="owned"></button>
      <button class="toggle ${g.manual === true ? 'on' : ''}" data-idx="${idx}" data-field="manual"></button>
      <button class="toggle ${g.boxed === true ? 'on' : ''}" data-idx="${idx}" data-field="boxed"></button>
      <select class="admin-select" data-idx="${idx}" data-field="condition">
        <option value="">—</option>
        <option value="Mint">Mint</option>
        <option value="Complete">Complete</option>
        <option value="Good">Good</option>
        <option value="Fair">Fair</option>
        <option value="Poor">Poor</option>
        <option value="Loose">Loose</option>
      </select>
      <input type="number" step="0.01" min="0" class="price-input" data-idx="${idx}" data-field="price" placeholder="0.00">
      <button class="btn-ghost" data-idx="${idx}" data-action="fetch-one" style="width:auto;padding:6px 8px;font-size:10px;">Fetch</button>
    `;
    const select = row.querySelector('select');
    select.value = g.condition || '';
    const priceInput = row.querySelector('.price-input');
    priceInput.value = g.price != null ? g.price : '';
    priceInput.title = g.priceSource === 'manual' ? 'Set manually — auto-update will not touch this'
      : g.priceSource === 'auto' ? `Auto-updated from CEX${g.priceUpdated ? ' on ' + g.priceUpdated : ''}`
      : 'Not yet priced';
    rowsEl.appendChild(row);
  });

  rowsEl.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const field = btn.dataset.field;
      allGames[idx][field] = !(allGames[idx][field] === true);
      btn.classList.toggle('on', allGames[idx][field] === true);
      markDirty();
    });
  });

  rowsEl.querySelectorAll('select.admin-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.idx);
      allGames[idx].condition = sel.value || null;
      markDirty();
    });
  });

  rowsEl.querySelectorAll('.price-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      const v = inp.value.trim();
      allGames[idx].price = v === '' ? null : Number(v);
      allGames[idx].priceSource = v === '' ? null : 'manual';
      markDirty();
    });
  });

  rowsEl.querySelectorAll('[data-action="fetch-one"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const game = allGames[idx];
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const match = await checkCexPrice(game.title, game.console);
        if (match && 'cashPrice' in match) {
          game.price = match.cashPrice;
          game.priceSource = 'auto';
          game.priceUpdated = new Date().toISOString().slice(0, 10);
          markDirty();
          renderRows();
        } else {
          btn.textContent = 'No match';
          setTimeout(() => { btn.textContent = 'Fetch'; btn.disabled = false; }, 1500);
        }
      } catch (e) {
        btn.textContent = 'Blocked';
        setTimeout(() => { btn.textContent = 'Fetch'; btn.disabled = false; }, 1500);
      }
    });
  });
}

function markDirty() {
  dirty = true;
  saveStatus.textContent = 'Unsaved changes';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Hardware (consoles) panel ----------

const hwSearch = document.getElementById('hw-search');
const hwRowsEl = document.getElementById('hw-rows');
const hwSaveStatus = document.getElementById('hw-save-status');
hwSearch.addEventListener('input', renderHardwareAdmin);

function renderHardwareAdmin() {
  const q = hwSearch.value.trim().toLowerCase();
  const filtered = hardware
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => !q || `${h.title} ${h.variation || ''}`.toLowerCase().includes(q));

  document.getElementById('hw-stats').innerHTML =
    `<span><strong>${hardware.length}</strong> total</span><span><strong>${filtered.length}</strong> shown</span>`;

  hwRowsEl.innerHTML = '';
  filtered.forEach(({ h, idx }) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.style.gridTemplateColumns = '1fr 1fr 70px 70px 70px 110px 90px 90px';
    row.innerHTML = `
      <span class="game-title">${escapeHtml(h.title)}</span>
      <input type="text" class="price-input" data-idx="${idx}" data-field="variation" placeholder="e.g. Elite 120GB" value="${escapeHtml(h.variation || '')}">
      <button class="toggle ${h.owned ? 'on' : ''}" data-idx="${idx}" data-field="owned"></button>
      <button class="toggle ${h.manual === true ? 'on' : ''}" data-idx="${idx}" data-field="manual"></button>
      <button class="toggle ${h.boxed === true ? 'on' : ''}" data-idx="${idx}" data-field="boxed"></button>
      <select class="admin-select" data-idx="${idx}" data-field="condition">
        <option value="">—</option>
        <option value="Mint">Mint</option>
        <option value="Complete">Complete</option>
        <option value="Good">Good</option>
        <option value="Fair">Fair</option>
        <option value="Poor">Poor</option>
        <option value="Loose">Loose</option>
      </select>
      <input type="number" step="0.01" min="0" class="price-input" data-idx="${idx}" data-field="price" placeholder="0.00" value="${h.price != null ? h.price : ''}">
      <button class="btn-ghost" data-idx="${idx}" data-action="delete-hw" style="width:auto;padding:6px 10px;font-size:11px;">Delete</button>
    `;
    row.querySelector('select').value = h.condition || '';
    hwRowsEl.appendChild(row);
  });

  hwRowsEl.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const field = btn.dataset.field;
      hardware[idx][field] = !(hardware[idx][field] === true);
      btn.classList.toggle('on', hardware[idx][field] === true);
      markHwDirty();
    });
  });

  hwRowsEl.querySelectorAll('select.admin-select').forEach(sel => {
    sel.addEventListener('change', () => {
      hardware[Number(sel.dataset.idx)].condition = sel.value || null;
      markHwDirty();
    });
  });

  hwRowsEl.querySelectorAll('input.price-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      const field = inp.dataset.field;
      if (field === 'price') {
        const v = inp.value.trim();
        hardware[idx].price = v === '' ? null : Number(v);
      } else {
        hardware[idx][field] = inp.value.trim() || null;
      }
      markHwDirty();
    });
  });

  hwRowsEl.querySelectorAll('[data-action="delete-hw"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (!confirm(`Remove "${hardware[idx].title}" from your consoles list?`)) return;
      hardware.splice(idx, 1);
      markHwDirty();
      renderHardwareAdmin();
    });
  });
}

function markHwDirty() {
  hwDirty = true;
  hwSaveStatus.textContent = 'Unsaved changes';
}

document.getElementById('add-hardware-btn').addEventListener('click', () => {
  const title = prompt('Console name (e.g. "Xbox 360", "Game Boy Color"):');
  if (!title || !title.trim()) return;
  hardware.unshift({
    id: `hw-${Date.now()}`,
    title: title.trim(),
    variation: null,
    owned: true,
    manual: null,
    boxed: null,
    condition: null,
    price: null,
    priceSource: null,
    priceUpdated: null,
  });
  markHwDirty();
  hwSearch.value = '';
  renderHardwareAdmin();
});

document.getElementById('hw-save-btn').addEventListener('click', async () => {
  hwSaveStatus.textContent = 'Saving…';
  try {
    const result = await ghPutFile('data/hardware.json', hardware, hardwareSha, 'Update consoles list');
    hardwareSha = result.content.sha;
    hwDirty = false;
    hwSaveStatus.textContent = 'Saved ✓ (may take a minute to appear live)';
  } catch (e) {
    hwSaveStatus.textContent = 'Save failed — check your token has repo write access.';
    console.error(e);
  }
});

// ---------- Bulk CEX price fetching (runs from this browser) ----------

const fetchStatus = document.getElementById('fetch-status');
let bulkFetchRunning = false;

async function bulkFetchPrices(scopeGames, label) {
  if (bulkFetchRunning) return;
  bulkFetchRunning = true;
  document.getElementById('fetch-current-console-btn').disabled = true;
  document.getElementById('fetch-all-btn').disabled = true;

  const eligible = scopeGames.filter(g => g.priceSource !== 'manual');
  let found = 0, missed = 0, blocked = 0;

  for (let i = 0; i < eligible.length; i++) {
    const game = eligible[i];
    fetchStatus.textContent = `Checking ${label}… ${i + 1}/${eligible.length} (${game.title})`;
    try {
      const match = await checkCexPrice(game.title, game.console);
      if (match && 'cashPrice' in match) {
        game.price = match.cashPrice;
        game.priceSource = 'auto';
        game.priceUpdated = new Date().toISOString().slice(0, 10);
        found++;
        dirty = true;
      } else {
        missed++;
      }
    } catch (e) {
      blocked++;
      // If CEX is blocking this browser too, stop early rather than
      // grinding through hundreds more failures.
      if (blocked >= 8 && found === 0) {
        fetchStatus.textContent = `Stopped — CEX appears to be blocking requests from this browser too (${blocked} failures in a row). Try again later, or from a different network.`;
        bulkFetchRunning = false;
        document.getElementById('fetch-current-console-btn').disabled = false;
        document.getElementById('fetch-all-btn').disabled = false;
        renderRows();
        return;
      }
    }

    // Autosave every 50 games so progress survives a closed tab.
    if (dirty && (i + 1) % 50 === 0) {
      try {
        const result = await ghPutFile('data/games.json', allGames, gamesSha, 'Auto-update CEX prices (in progress)');
        gamesSha = result.content.sha;
      } catch (e) { /* keep going even if an autosave hiccups */ }
    }

    await new Promise(r => setTimeout(r, 400));
  }

  if (dirty) {
    try {
      const result = await ghPutFile('data/games.json', allGames, gamesSha, 'Auto-update CEX prices');
      gamesSha = result.content.sha;
      dirty = false;
    } catch (e) {
      fetchStatus.textContent = 'Fetched prices but the final save failed — click Save changes below to retry.';
      bulkFetchRunning = false;
      document.getElementById('fetch-current-console-btn').disabled = false;
      document.getElementById('fetch-all-btn').disabled = false;
      renderRows();
      return;
    }
  }

  fetchStatus.textContent = `Done — ${found} prices found and saved, ${missed} no confident match.`;
  bulkFetchRunning = false;
  document.getElementById('fetch-current-console-btn').disabled = false;
  document.getElementById('fetch-all-btn').disabled = false;
  renderRows();
}

document.getElementById('fetch-current-console-btn').addEventListener('click', () => {
  const consoleName = (consoles.find(c => c.id === currentConsoleId) || {}).name || currentConsoleId;
  bulkFetchPrices(currentGames(), consoleName);
});

document.getElementById('fetch-all-btn').addEventListener('click', () => {
  if (!confirm('This checks every game across all consoles — likely 10+ minutes. Keep this tab open while it runs. Continue?')) return;
  bulkFetchPrices(allGames, 'entire collection');
});

// ---------- Add game ----------

document.getElementById('add-game-btn').addEventListener('click', () => {
  const title = prompt('Game title:');
  if (!title || !title.trim()) return;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  allGames.unshift({
    id: `${currentConsoleId}-${slug}-${Date.now()}`,
    title: title.trim(),
    console: currentConsoleId,
    owned: true,
    manual: null,
    boxed: null,
    condition: null,
    price: null,
    priceSource: null,
    priceUpdated: null,
  });
  markDirty();
  adminSearch.value = '';
  renderRows();
});

// ---------- Save games ----------

document.getElementById('save-btn').addEventListener('click', async () => {
  saveStatus.textContent = 'Saving…';
  try {
    const result = await ghPutFile('data/games.json', allGames, gamesSha, `Update collection data`);
    gamesSha = result.content.sha;
    dirty = false;
    saveStatus.textContent = 'Saved ✓ (may take a minute to appear live)';
  } catch (e) {
    saveStatus.textContent = 'Save failed — check your token has repo write access.';
    console.error(e);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty || hwDirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Add console ----------

document.getElementById('create-console-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('add-console-status');
  const name = document.getElementById('new-console-name').value.trim();
  if (!name) { statusEl.textContent = 'Enter a console name.'; return; }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (consoles.some(c => c.id === id)) { statusEl.textContent = 'That console already exists.'; return; }

  statusEl.textContent = 'Creating…';
  try {
    consoles.push({ id, name, active: true });
    const result = await ghPutFile('data/consoles.json', consoles, consolesSha, `Add ${name} console tab`);
    consolesSha = result.content.sha;
    consoleSelect.innerHTML = consoles.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    consoleSelect.value = id;
    currentConsoleId = id;
    document.getElementById('new-console-name').value = '';
    renderRows();
    statusEl.textContent = `"${name}" created — switch to the Games panel to add titles, then Save changes.`;
  } catch (e) {
    statusEl.textContent = 'Could not create console — check your token has repo write access.';
    console.error(e);
  }
});

// ---------- Settings: run price update now ----------

document.getElementById('run-price-update-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('price-update-status');
  statusEl.textContent = 'Starting…';
  try {
    await ghDispatchWorkflow('update-prices.yml', 'main');
    statusEl.textContent = 'Started ✓ — running on GitHub now, takes about 7–10 minutes. Check the Actions tab on GitHub to watch progress, or just check back here later.';
  } catch (e) {
    statusEl.textContent = 'Could not start it — check your token has repo access, and that update-prices.yml exists in .github/workflows/.';
    console.error(e);
  }
});

// ---------- Settings: change passcodes ----------

document.getElementById('save-passcodes-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('passcode-status');
  const newSite = document.getElementById('new-site-passcode').value.trim();
  const newAdmin = document.getElementById('new-admin-password').value.trim();
  if (!newSite && !newAdmin) { statusEl.textContent = 'Enter at least one new passcode.'; return; }

  statusEl.textContent = 'Saving…';
  try {
    const { content: auth, sha } = await ghGetFile('data/auth.json');
    if (newSite) auth.siteHash = await sha256Hex(newSite);
    if (newAdmin) auth.adminHash = await sha256Hex(newAdmin);
    auth.note = 'Passcodes updated from the admin Settings panel.';
    await ghPutFile('data/auth.json', auth, sha, 'Update passcodes');
    statusEl.textContent = 'Updated ✓ — use the new passcode(s) next time you sign in.';
    document.getElementById('new-site-passcode').value = '';
    document.getElementById('new-admin-password').value = '';
  } catch (e) {
    statusEl.textContent = 'Could not update — check your token has repo write access.';
    console.error(e);
  }
});

init();
