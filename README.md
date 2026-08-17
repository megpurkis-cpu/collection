# The Collection — setup guide

A private, searchable database of your game collection across 21 consoles.
Built to work entirely from a browser or the GitHub mobile app — same idea
as the Church Preen site and the packing list.

## Files to upload

Everything now lives in just a handful of files:

```
collection/
  index.html
  README.md
  css/style.css
  js/auth.js, site.js, github-api.js, admin.js
  data/consoles.json, games.json, auth.json
  admin/index.html, admin/dashboard.html
```

All 1,086 games across every console live in the single `data/games.json`
file (each game is tagged with which console it belongs to), so you only
need to get 9 files into the right folders — not one per console.

## 1. Create the repo

1. github.com (or the GitHub app), logged into your **personal** account —
   the same one as the packing list, not the school one.
2. New repository, name it `collection`, keep it **Public**.

## 2. Upload the files

**On desktop/Chromebook:** Add file → Upload files, drag the whole folder
in, or upload flat and use the rename trick below.

**On Android, in the browser:** Add file → Upload files. Above the drop
zone, tap the repo name breadcrumb and type a folder name (e.g. `css`)
before choosing files — they land inside that folder automatically, no
rename needed. Do this once per folder: `css`, `js`, `data`, `admin`, plus
one more upload with the path left blank for `index.html` and `README.md`.

**If that path field doesn't show up on your phone (some mobile browser
views hide it):** upload everything flat, then rename each file afterwards
to add its folder — e.g. change `style.css` to `css/style.css` when
editing it. To edit a file when the pencil icon is hidden, change `blob` to
`edit` in the file's URL. With the file count down to 9, this is a lot more
manageable than before. The GitHub Android app's Edit file screens differ
by version — if the filename isn't tappable there, use the mobile browser
`blob` → `edit` trick instead.

Only 9 files need placing into folders: `style.css` (1), the four `.js`
files, `consoles.json` + `games.json` + `auth.json` (3), and `admin/index.html`
+ `admin/dashboard.html` (2, careful — see the note below about the
duplicate `index.html` name).

**Duplicate filename note:** the root `index.html` and `admin/index.html`
have the same name. Upload/rename them in separate batches so one doesn't
overwrite the other — get the root one sorted first, then handle admin's
copy on its own.

## 3. Turn on GitHub Pages

Settings → Pages → Source: **Deploy from a branch**, branch **main**,
folder **/ (root)** → Save. Live in a minute or two at
`https://<your-username>.github.io/collection/`.

## 4. Sign in and change the default passcodes

Ships with two temporary codes — change both before sharing the link:

- **Site passcode**: `xboxvault`
- **Admin password**: `Collection2026!`

Go to `.../collection/admin/`, sign in with the admin password, your
GitHub username, repo name (`collection`), and a **Personal Access Token**
(GitHub.com → profile photo → Settings → Developer settings → Personal
access tokens → Tokens (classic) → Generate new token → tick **repo** →
generate → copy the `ghp_…` value). It's stored only in that browser.

Then open the Settings tab in admin and set new codes.

## 5. Using it day-to-day

- **Public site**: dropdown picker for all 21 consoles, search, filters,
  sortable columns. Picking a console reskins the whole page to match it.
- **Admin panel**: pick a console from the dropdown, toggle Owned / Manual
  / Boxed, set Condition, add new games, hit **Save changes** to commit.
  **Add console** creates a new tab instantly — add its games from the
  Games panel afterwards.

## A note on the passcode

This is a soft lock, not real security — fine for keeping a personal
collection page away from casual visitors and search engines, since the
repo itself is public. Don't rely on it for anything sensitive.

## Auto-updating CEX prices

A scheduled job checks CEX's current buy price for every game and commits
the updates automatically — no phone or laptop needs to be open for it to
run.

- **Runs**: every Monday at 06:00 UTC. To change this, edit the `cron` line
  in `.github/workflows/update-prices.yml` (a "cron expression" — e.g.
  `0 6 * * *` for daily).
- **Run it right now**: repo → **Actions** tab → **Update CEX prices** →
  **Run workflow**.
- **Your manual prices are safe**: anything you type into the Price field
  in admin is marked as yours and the automatic job will never overwrite
  it. Only games with no price, or ones the automatic job set itself, get
  refreshed.
- **It won't catch everything**: matching a plain title to the right
  platform's listing on CEX is best-effort — obscure titles, bundles, or
  unusual editions may come back blank rather than risk guessing wrong.
  Anything it misses, you can still fill in yourself with the **Check
  CEX** button in admin.
- **It's built on an unofficial CEX endpoint** — not something they
  publish or support, so it could change or stop working without notice.
  If it does, nothing else about the site is affected; prices just stop
  refreshing until it's fixed.

No extra setup needed — this uses GitHub's own permissions to commit, not
your personal access token.

## Data notes

Two entries need a glance when you get to them in admin: an N64 accessory
("Action Replay Video Game Enhancer") and a PS2 "Demo Disc" — both had no
usable status on the original sheets, so their Condition/Manual/Boxed
fields are blank.

---
*Built with Claude AI at claude.ai — come back here to continue the build.*
