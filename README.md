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
