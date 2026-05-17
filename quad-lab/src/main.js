import * as THREE from 'three';
import openingUrl from '../../assets/opening.mp4?url';

const STORAGE_KEY = 'quad-lab:cornersPx';

function loadCorners() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const out = parsed.map((p) => {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return [x, y];
    });
    if (out.some((c) => c == null)) return null;
    return out;
  } catch {
    return null;
  }
}

function saveCorners(cornersPx) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cornersPx));
  } catch {
    /* ignore */
  }
}

function defaultCorners(w, h) {
  const m = 48;
  return [
    [m, m],
    [w - m, m],
    [w - m, h - m],
    [m, h - m]
  ];
}

function pixelsToNdc(x, y, w, h) {
  const ndcX = (x / w) * 2 - 1;
  const ndcY = -(y / h) * 2 + 1;
  return new THREE.Vector3(ndcX, ndcY, 0);
}

/**
 * Bilinear grid on the four screen corners. Many small affine cells approximate
 * smooth perspective-correct UVs; one big quad shows a visible diagonal seam.
 */
function buildSubdividedQuadGeometry(cornersPx, w, h, segX, segY) {
  const [tl, tr, br, bl] = cornersPx;
  const vx = segX + 1;
  const vy = segY + 1;
  const vertCount = vx * vy;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  for (let j = 0; j <= segY; j++) {
    const fv = j / segY;
    for (let i = 0; i <= segX; i++) {
      const fu = i / segX;
      const idx = j * vx + i;

      const topX = tl[0] + (tr[0] - tl[0]) * fu;
      const topY = tl[1] + (tr[1] - tl[1]) * fu;
      const botX = bl[0] + (br[0] - bl[0]) * fu;
      const botY = bl[1] + (br[1] - bl[1]) * fu;
      const px = topX + (botX - topX) * fv;
      const py = topY + (botY - topY) * fv;

      const ndc = pixelsToNdc(px, py, w, h);
      positions[idx * 3] = ndc.x;
      positions[idx * 3 + 1] = ndc.y;
      positions[idx * 3 + 2] = ndc.z;

      uvs[idx * 2] = fu;
      uvs[idx * 2 + 1] = 1 - fv;
    }
  }

  const indices = new Uint32Array(segX * segY * 6);
  let wIdx = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * vx + i;
      const b = a + 1;
      const d = a + vx;
      const c = d + 1;
      indices[wIdx++] = a;
      indices[wIdx++] = b;
      indices[wIdx++] = c;
      indices[wIdx++] = a;
      indices[wIdx++] = c;
      indices[wIdx++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function makeVideoTexture() {
  const video = document.createElement('video');
  video.src = openingUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.volume = 1;
  video.crossOrigin = 'anonymous';

  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const tryPlayMuted = () => {
    video.play().catch(() => {});
  };

  const unlockAudio = () => {
    video.muted = false;
    video.play().catch(() => {});
  };

  for (const evt of ['pointerdown', 'keydown']) {
    document.body.addEventListener(evt, unlockAudio, { once: true });
  }

  tryPlayMuted();

  return { video, tex };
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
camera.position.z = 1;
camera.lookAt(0, 0, 0);

let cornersPx = loadCorners() ?? defaultCorners(window.innerWidth, window.innerHeight);
/** Subdivisions per axis (more = smoother bilinear warp, less diagonal artifact). */
let gridSegments = 32;

const { tex } = makeVideoTexture();
const quadMat = new THREE.MeshBasicMaterial({
  map: tex,
  side: THREE.DoubleSide
});
let quadMesh = new THREE.Mesh(
  buildSubdividedQuadGeometry(cornersPx, window.innerWidth, window.innerHeight, gridSegments, gridSegments),
  quadMat
);
scene.add(quadMesh);

const handleGeo = new THREE.PlaneGeometry(0.036, 0.036);
const handleMat = new THREE.MeshBasicMaterial({ color: 0xff8844 });
const handles = cornersPx.map(([x, y]) => {
  const m = new THREE.Mesh(handleGeo, handleMat);
  const ndc = pixelsToNdc(x, y, window.innerWidth, window.innerHeight);
  m.position.copy(ndc);
  scene.add(m);
  return m;
});

function syncHandleScales() {
  const aw = window.innerWidth;
  const ah = window.innerHeight;
  if (ah <= 0) {
    return;
  }
  const sx = ah / aw;
  handles.forEach((m) => m.scale.set(sx, 1, 1));
}

syncHandleScales();

/** Pick radius in CSS pixels — easier to grab than tiny NDC rings. */
const HANDLE_HIT_PX = 40;

let dragIndex = -1;
let dragGrabOffsetX = 0;
let dragGrabOffsetY = 0;

function pickCornerIndex(clientX, clientY) {
  let best = -1;
  let bestDist = Infinity;
  cornersPx.forEach(([cx, cy], i) => {
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d <= HANDLE_HIT_PX && d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function refreshQuad() {
  quadMesh.geometry.dispose();
  quadMesh.geometry = buildSubdividedQuadGeometry(
    cornersPx,
    window.innerWidth,
    window.innerHeight,
    gridSegments,
    gridSegments
  );
  cornersPx.forEach((c, i) => {
    const ndc = pixelsToNdc(c[0], c[1], window.innerWidth, window.innerHeight);
    handles[i].position.copy(ndc);
  });
  syncHandleScales();
  saveCorners(cornersPx);
}

function onPointerDown(e) {
  dragIndex = pickCornerIndex(e.clientX, e.clientY);
  if (dragIndex < 0) {
    return;
  }
  const [cx, cy] = cornersPx[dragIndex];
  dragGrabOffsetX = cx - e.clientX;
  dragGrabOffsetY = cy - e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (dragIndex < 0) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  cornersPx[dragIndex] = [
    Math.max(0, Math.min(w, e.clientX + dragGrabOffsetX)),
    Math.max(0, Math.min(h, e.clientY + dragGrabOffsetY))
  ];
  refreshQuad();
}

function onPointerUp(e) {
  if (dragIndex >= 0) {
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
  }
  dragIndex = -1;
}

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'r' || e.key === 'R') {
    cornersPx = defaultCorners(window.innerWidth, window.innerHeight);
    refreshQuad();
    return;
  }
  if (e.key === '[') {
    gridSegments = Math.max(2, gridSegments - 4);
    refreshQuad();
    return;
  }
  if (e.key === ']') {
    gridSegments = Math.min(128, gridSegments + 4);
    refreshQuad();
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  cornersPx = cornersPx.map(([x, y]) => [
    Math.min(x, w - 1),
    Math.min(y, h - 1)
  ]);
  refreshQuad();
});

function tick() {
  if (tex.image && tex.image.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    tex.needsUpdate = true;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
