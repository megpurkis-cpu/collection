// Minimal GitHub Contents API wrapper used by the admin dashboard.
// Reads owner/repo/token from localStorage (set at admin login).

function ghConfig() {
  return {
    owner: localStorage.getItem('collection_gh_owner'),
    repo: localStorage.getItem('collection_gh_repo'),
    token: localStorage.getItem('collection_gh_token'),
  };
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
}

// Fetch a file's current content (parsed JSON) and its sha (needed to update it).
async function ghGetFile(path) {
  const { owner, repo, token } = ghConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content)));
  return { content: JSON.parse(decoded), sha: data.sha };
}

// Write (create or update) a JSON file. Pass the existing sha to update, or
// null/undefined to create a new file.
async function ghPutFile(path, obj, sha, message) {
  const { owner, repo, token } = ghConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const jsonStr = JSON.stringify(obj, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
  const body = { message, content: b64 };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub save failed (${res.status}): ${await res.text()}`);
  return res.json();
}
