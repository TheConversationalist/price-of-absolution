# price-of-absolution

Interactive Arctic solo-survival story proof-of-concept.

## Sub-projects

- `book-projection`: p5.js projection app rendering scene video, text, and layered audio.
- `tablet-controller`: p5.js controller app with two-choice scene input, timeout countdown, and 3D d20 roll.
- `sync-server`: WebSocket relay for LAN synchronization between book and tablet.
- `shared`: common runtime config, story schema, Twine importer, and story data.

## Quick Start

1. Install Node.js 20+ and npm.
2. From repository root, run `npm install`.
3. Start relay server: `npm run dev:sync`.
4. Start projection app: `npm run dev:book`.
5. Start tablet app: `npm run dev:tablet`.

## Story Authoring

- Edit `story.twee` in Twine/Twee format.
- Convert it to runtime JSON with: `npm run story:import`.
- Runtime story file is `shared/story/story.json`.

## Demo Replay Script

- With sync server running, execute deterministic event walkthrough:
  - `npm run demo:replay`
- This sends scripted story events for repeatable projection/tablet demo flow.
