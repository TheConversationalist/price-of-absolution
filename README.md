# price-of-absolution

Interactive Arctic solo-survival story proof-of-concept.

## Sub-projects

- `book-projection`: p5.js projection app rendering scene video, text, and layered audio.
- `tablet-controller`: p5.js controller app with two-choice scene input, timeout countdown, and 3D d20 roll.
- `sync-server`: WebSocket relay for LAN synchronization between book and tablet.
- `shared`: common runtime config, story schema, Twine importer, and story data.

## Quick Start

1. Install Node.js 20+ and npm.
2. Open a terminal and `cd /Users/jonathana.mohr/Documents/Capstone/Code/price-of-absolution`.
3. From repository root, run `npm install`.
4. In terminal #1, start relay server: `npm run dev:sync`.
5. In terminal #2, start projection app: `npm run dev:book`.
6. In terminal #3, start tablet app: `npm run dev:tablet`.
7. Open the app URLs printed by Vite in each terminal (default ports are usually `5173`/`5174`).

## Story Authoring

- Edit `story.twee` in Twine/Twee format.
- Convert it to runtime JSON with: `npm run story:import`.
- Runtime story file is `shared/story/story.json`.

## Demo Replay Script

- With sync server running, execute deterministic event walkthrough:
  - `npm run demo:replay`
- This sends scripted story events for repeatable projection/tablet demo flow.
