# price-of-absolution

Interactive Arctic solo-survival story proof-of-concept.

## Sub-projects

- `book-projection`: p5.js projection app rendering scene video, text, and layered audio.
- `tablet-controller`: p5.js controller app that shows the current scene’s branch choices (in sync with the book) and a timeout countdown.
- `sync-server`: WebSocket relay for LAN synchronization between book and tablet.
- `shared`: common runtime config, story schema, Twine importer, and story data.

## Quick Start

1. Install Node.js 20+ and npm.
2. From repository root, run `npm install`.
3. Keep story media under `assets/video/` and bed audio in `assets/` — `dramatic-music.wav` is included. **`wind-sfx.wav` is gitignored** (over GitHub’s size limit); place your own `assets/wind-sfx.wav` if the project expects it.
4. Start relay server: `npm run dev:sync`.
5. Start projection app: `npm run dev:book`.
6. Start tablet app: `npm run dev:tablet`.
7. Open the app URLs printed by Vite in each terminal (default ports are usually `5173`/`5174`).

## Story Authoring

- Edit `story.twee` in Twine/Twee format.
- Convert it to runtime JSON with: `npm run story:import`.
- Runtime story file is `shared/story/story.json`.

## Media layout

- Videos: `assets/video/...` (paths in config look like `/video/...`).
- **`assets/wind-sfx.wav`**: not in git (size); add locally for ambient wind if enabled in config.
- Optional `npm run media:sync` copies into `book-projection/public/` only if you need a standalone static folder; normal `dev:book` / `vite build` do not require it.

## Demo Replay Script

- With sync server running, execute deterministic event walkthrough:
  - `npm run demo:replay`
- This sends scripted story events for repeatable projection/tablet demo flow.

## Pushing to GitHub

Remote: `https://github.com/TheConversationalist/price-of-absolution.git` (`origin`, branch `main`).

Large media stays local (see `.gitignore`): `assets/video/`, `*.mp4`, `assets/wind-sfx.wav`.

**One-time setup** (Git + GitHub CLI; installs `gh` via winget if needed):

```powershell
.\scripts\setup-github-push.ps1
```

That script sets git name/email **for this repo only** (local `git config`, not global), runs `gh auth login`, and wires Git Credential Manager for HTTPS pushes.

**Push changes:**

```powershell
git add -A
git commit -m "Describe your change"
git push origin main
```

If you lack write access to `TheConversationalist/price-of-absolution`, fork on GitHub then:

```powershell
gh repo fork TheConversationalist/price-of-absolution --remote=true
git push -u origin main
```

Optional LAN overrides: copy `.env.example` to `.env` and set `VITE_SYNC_SERVER_URL` (not committed).
