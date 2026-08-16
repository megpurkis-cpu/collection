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

const panels = { games: 'panel-games', 'add-console': 'panel-add-console', settings: 'panel-settings' };
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

const consoleSelect = document.getElementById('console-select');
const adminSearch = document.getElementById('admin-search');
const rowsEl = document.getElementById('admin-rows');
const saveStatus = document.getElementById('save-status');

adminSearch.addEventListener('input', renderRows);

async function init() {
  saveStatus.textContent = 'Loading…';
  try {
    const [consolesFile, gamesFile] = await Promise.all([
      ghGetFile('data/consoles.json'),
      ghGetFile('data/games.json'),
    ]);
    consoles = consolesFile.content || [];
    consolesSha = consolesFile.sha;
    allGames = gamesFile.content || [];
    gamesSha = gamesFile.sha;

    consoleSelect.innerHTML = consoles.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    currentConsoleId = consoles[0] && consoles[0].id;
    dirty = false;
    renderRows();
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
    `;
    const select = row.querySelector('select');
    select.value = g.condition || '';
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
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
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
