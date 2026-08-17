// Shared passcode helpers. Codes are never stored in plaintext in the repo —
// only their SHA-256 hash lives in data/auth.json. This keeps out casual
// visitors, but remember: this is a public static site, so treat it as a
// soft lock, not real security.

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// authJsonPath: relative path to data/auth.json from the calling page
// (e.g. "data/auth.json" from index.html, "../data/auth.json" from admin/*.html)
async function loadAuthConfig(authJsonPath) {
  const res = await fetch(authJsonPath, { cache: 'no-store' });
  return res.json();
}

function sessionKey(kind) {
  return `collection_${kind}_unlocked`;
}

function isUnlocked(kind) {
  return sessionStorage.getItem(sessionKey(kind)) === 'true';
}

function setUnlocked(kind) {
  sessionStorage.setItem(sessionKey(kind), 'true');
}
