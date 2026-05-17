import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoAssets = path.resolve(__dirname, '../assets');

/** URL paths (story + runtime) that map to files in assets/ */
const ROOT_AUDIO = new Set(['/wind-sfx.wav', '/dramatic-music.wav']);

const MIME = {
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg'
};

function resolveAssetFile(urlPathname) {
  const rel = urlPathname.startsWith('/') ? urlPathname.slice(1) : urlPathname;
  const candidate = path.normalize(path.join(repoAssets, rel));
  const base = path.join(path.normalize(repoAssets), path.sep);
  if (!candidate.startsWith(base)) {
    return null;
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  return candidate;
}

function serveRepoAssets(req, res, next) {
  const raw = req.url?.split('?')[0];
  if (!raw || req.method !== 'GET') {
    next();
    return;
  }
  let filePath = null;
  if (raw.startsWith('/video/')) {
    filePath = resolveAssetFile(raw);
  } else if (ROOT_AUDIO.has(raw)) {
    filePath = resolveAssetFile(raw);
  }
  if (!filePath) {
    next();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  createReadStream(filePath).pipe(res);
}

/** Dev server: serve /video/* and bed-loop WAVs from ../assets (no copy step). */
export function repoAssetsDevPlugin() {
  return {
    name: 'repo-assets-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => serveRepoAssets(req, res, next));
    }
  };
}

/** Production: mirror assets/video and root WAVs into dist/ so paths stay the same. */
export function repoAssetsBuildPlugin() {
  let outDir;
  return {
    name: 'repo-assets-build',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const videoSrc = path.join(repoAssets, 'video');
      if (existsSync(videoSrc)) {
        mkdirSync(path.join(outDir, 'video'), { recursive: true });
        cpSync(videoSrc, path.join(outDir, 'video'), { recursive: true });
      }
      for (const wav of ['wind-sfx.wav', 'dramatic-music.wav']) {
        const src = path.join(repoAssets, wav);
        if (existsSync(src)) {
          cpSync(src, path.join(outDir, wav));
        }
      }
    }
  };
}
