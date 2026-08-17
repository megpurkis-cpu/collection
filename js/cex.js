// Shared CEX WeBuy lookup logic — best-effort platform keyword matching,
// mirroring scripts/update_prices.py. Used by both the public site (the
// "you don't own this" empty-state check) and the admin panel (single and
// bulk price fetching). Runs as a normal browser request, which is not
// blocked the way requests from GitHub Actions' datacenter IPs are.

const CONSOLE_PATTERNS = {
  xbox: [/\bxbox\b/i, /360|xbox one/i],
  'xbox-360': [/xbox\s*360/i, null],
  'xbox-one': [/xbox\s*one/i, null],
  nes: [/\bnes\b/i, /snes|genesis/i],
  snes: [/\bsnes\b|super nintendo/i, null],
  n64: [/\bn64\b|nintendo\s*64/i, null],
  gamecube: [/gamecube/i, null],
  wii: [/\bwii\b/i, /wii\s*u/i],
  'wii-u': [/wii\s*u/i, null],
  gameboy: [/game\s*boy\b/i, /color|advance/i],
  'gameboy-color': [/game\s*boy\s*color/i, null],
  gba: [/game\s*boy\s*advance|\bgba\b/i, null],
  ds: [/\bds\b|nintendo\s*ds/i, /3ds/i],
  ps1: [/playstation\s*1\b|\bps1\b|playstation\s*software\b/i, /playstation\s*[2-5]/i],
  ps2: [/playstation\s*2|\bps2\b/i, null],
  psp: [/\bpsp\b|playstation\s*portable/i, null],
  genesis: [/mega\s*drive|genesis/i, null],
  'master-system': [/master\s*system/i, null],
  'game-gear': [/game\s*gear/i, null],
  dreamcast: [/dreamcast/i, null],
  'atari-lynx': [/lynx/i, null],
};

async function checkCexPrice(query, consoleId) {
  const url = `https://wss2.cex.uk.webuy.io/v3/boxes?q=${encodeURIComponent(query)}&firstRecord=1&count=15&sortBy=relevance&sortOrder=desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('bad response');
  const data = await res.json();
  const boxes = (data.response && data.response.data && data.response.data.boxes) || [];
  const [include, exclude] = CONSOLE_PATTERNS[consoleId] || [null, null];
  const matches = boxes.filter(b => {
    const cat = `${b.categoryName || ''} ${b.categoryFriendlyName || ''}`;
    if (include && !include.test(cat)) return false;
    if (exclude && exclude.test(cat)) return false;
    return !b.cannotBuy;
  });
  if (!matches.length) return null;
  const exact = matches.find(b => (b.boxName || '').trim().toLowerCase() === query.trim().toLowerCase());
  return exact || matches[0];
}
