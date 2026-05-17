/**
 * Optional: copy assets → book-projection/public for static hosting workflows.
 * Default dev/prod: book Vite serves from ../assets (see book-projection/vite.repoAssetsPlugin.js).
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const pub = path.join(root, 'book-projection', 'public');
const videoDir = path.join(pub, 'video');
const absolutionSrc = path.join(assetsDir, 'video', 'absolution');
const absolutionDest = path.join(videoDir, 'absolution');

if (!existsSync(assetsDir)) {
  console.warn('[sync-book-media] No assets/ folder; skipping.');
  process.exit(0);
}

mkdirSync(videoDir, { recursive: true });

for (const f of ['wind-sfx.wav', 'dramatic-music.wav']) {
  const src = path.join(assetsDir, f);
  const dest = path.join(pub, f);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`[sync-book-media] ${f}`);
  }
}

const openingSrc = path.join(assetsDir, 'opening.mp4');
if (existsSync(openingSrc)) {
  cpSync(openingSrc, path.join(pub, 'opening.mp4'));
  console.log('[sync-book-media] opening.mp4');
  for (const name of ['ridge-loop.mp4', 'valley-loop.mp4']) {
    cpSync(openingSrc, path.join(videoDir, name));
  }
  console.log('[sync-book-media] video/ridge-loop.mp4, video/valley-loop.mp4 (from opening.mp4)');
}

if (existsSync(absolutionSrc)) {
  mkdirSync(absolutionDest, { recursive: true });
  for (const name of readdirSync(absolutionSrc)) {
    if (!name.endsWith('.mp4')) {
      continue;
    }
    cpSync(path.join(absolutionSrc, name), path.join(absolutionDest, name));
    console.log(`[sync-book-media] video/absolution/${name}`);
  }
}
