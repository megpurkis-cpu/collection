#!/usr/bin/env python3
"""
Updates data/games.json with current CEX "cash price" (what CEX would pay
to buy the game from you) for every game NOT marked priceSource="manual".

Uses CEX's unofficial WeBuy search API (wss2.cex.uk.webuy.io). This is not
an officially documented or supported endpoint — it could change or stop
working without notice. If that happens, prices simply stop updating;
nothing else about the site depends on it.

Matching a plain title to the right platform's listing is done with
best-effort keyword patterns per console (see CONSOLE_PATTERNS below). It
will sometimes miss obscure titles, bundles, or unusual editions — those
are left with whatever price they had before (or blank), never guessed
wrongly on purpose. Prices set by hand in the admin panel
(priceSource="manual") are never touched by this script.

Run manually:  python3 scripts/update_prices.py
Run automatically: see .github/workflows/update-prices.yml
"""
import json
import re
import time
import sys
import urllib.request
import urllib.parse
from datetime import date, timezone

GAMES_PATH = "data/games.json"
API_BASE = "https://wss2.cex.uk.webuy.io/v3/boxes"
REQUEST_DELAY_SECONDS = 0.6  # be polite; ~1086 games takes ~10-12 minutes
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Referer": "https://uk.webuy.com/",
    "Origin": "https://uk.webuy.com",
}

# (include pattern, exclude pattern-or-None) — matched against CEX's
# categoryName/categoryFriendlyName in lowercase. Best-effort only.
CONSOLE_PATTERNS = {
    "xbox": (r"\bxbox\b", r"360|xbox one"),
    "xbox-360": (r"xbox\s*360", None),
    "xbox-one": (r"xbox\s*one", None),
    "nes": (r"\bnes\b", r"snes|genesis"),
    "snes": (r"\bsnes\b|super nintendo", None),
    "n64": (r"\bn64\b|nintendo\s*64", None),
    "gamecube": (r"gamecube", None),
    "wii": (r"\bwii\b", r"wii\s*u"),
    "wii-u": (r"wii\s*u", None),
    "gameboy": (r"game\s*boy\b", r"color|advance"),
    "gameboy-color": (r"game\s*boy\s*color", None),
    "gba": (r"game\s*boy\s*advance|\bgba\b", None),
    "ds": (r"\bds\b|nintendo\s*ds", r"3ds"),
    "ps1": (r"playstation\s*1\b|\bps1\b|playstation\s*software\b", r"playstation\s*[2-5]"),
    "ps2": (r"playstation\s*2|\bps2\b", None),
    "psp": (r"\bpsp\b|playstation\s*portable", None),
    "genesis": (r"mega\s*drive|genesis", None),
    "master-system": (r"master\s*system", None),
    "game-gear": (r"game\s*gear", None),
    "dreamcast": (r"dreamcast", None),
    "atari-lynx": (r"lynx", None),
}


def fetch_json(url):
    req = urllib.request.Request(url, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_cex(title):
    q = urllib.parse.quote(title)
    url = f"{API_BASE}?q={q}&firstRecord=1&count=20&sortBy=relevance&sortOrder=desc"
    try:
        data = fetch_json(url)
    except Exception as e:
        print(f"  ! search failed for {title!r}: {e}", file=sys.stderr)
        return []
    return (data.get("response", {}).get("data", {}) or {}).get("boxes", []) or []


def best_match(boxes, console_id, title):
    include, exclude = CONSOLE_PATTERNS.get(console_id, (None, None))
    if include is None:
        return None
    candidates = []
    for box in boxes:
        cat = f"{box.get('categoryName', '')} {box.get('categoryFriendlyName', '')}".lower()
        if not re.search(include, cat):
            continue
        if exclude and re.search(exclude, cat):
            continue
        if box.get("cannotBuy"):
            continue
        candidates.append(box)
    if not candidates:
        return None
    # Prefer an exact (case-insensitive) title match; otherwise take the
    # first (most relevant, since the API sorts by relevance).
    tl = title.strip().lower()
    for box in candidates:
        if box.get("boxName", "").strip().lower() == tl:
            return box
    return candidates[0]


def main():
    with open(GAMES_PATH) as f:
        games = json.load(f)

    today = date.today().isoformat()
    updated, skipped_manual, no_match = 0, 0, 0
    consecutive_failures = 0

    for i, g in enumerate(games, start=1):
        if g.get("priceSource") == "manual":
            skipped_manual += 1
            continue

        boxes = search_cex(g["title"])

        if not boxes:
            consecutive_failures += 1
        else:
            consecutive_failures = 0

        # If the very first several requests all come back empty, CEX is
        # almost certainly blocking this run entirely (e.g. their site
        # blocking GitHub's server IP ranges) rather than just missing a
        # few titles. No point grinding through 1,000+ more requests for
        # the same result — bail out with a clear message instead.
        if i <= 15 and consecutive_failures >= 10:
            print(
                "\nAborting early: the first 10+ requests all failed. "
                "CEX is very likely blocking requests from GitHub's servers "
                "entirely, rather than this being a per-title issue. "
                "See the '! search failed' lines above for the exact error. "
                "No changes have been saved this run.",
                file=sys.stderr,
            )
            sys.exit(1)

        match = best_match(boxes, g.get("console"), g["title"])

        if match and "cashPrice" in match:
            g["price"] = match["cashPrice"]
            g["priceSource"] = "auto"
            g["priceUpdated"] = today
            updated += 1
        else:
            no_match += 1

        if i % 50 == 0:
            print(f"...{i}/{len(games)} processed")

        time.sleep(REQUEST_DELAY_SECONDS)

    with open(GAMES_PATH, "w") as f:
        json.dump(games, f, indent=2)

    print(f"\nDone. {updated} prices updated, {no_match} no confident match, "
          f"{skipped_manual} skipped (manually priced).")


if __name__ == "__main__":
    main()
