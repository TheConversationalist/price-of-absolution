import * as THREE from 'three';

const HANDLE_HIT_PX = 40;

function loadCorners(storageKey, w, h, runtimeConfig) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 4) {
        const out = parsed.map((p) => {
          if (!Array.isArray(p) || p.length !== 2) return null;
          const x = Number(p[0]);
          const y = Number(p[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return [x, y];
        });
        if (!out.some((c) => c == null)) {
          return out;
        }
      }
    }
  } catch {
    /* ignore */
  }
  const rc = runtimeConfig?.projection?.corners;
  if (Array.isArray(rc) && rc.length === 4) {
    const out = rc.map((p) => {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return [x, y];
    });
    if (!out.some((c) => c == null)) {
      return out;
    }
  }
  return defaultCorners(w, h);
}

function saveCorners(storageKey, cornersPx) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cornersPx));
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

function buildSubdividedQuadGeometry(cornersPx, w, h, segX, segY) {
  const [tl, tr, br, bl] = cornersPx;
  const vx = segX + 1;
  const vertCount = vx * (segY + 1);
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
  let wi = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * vx + i;
      const b = a + 1;
      const d = a + vx;
      const c = d + 1;
      indices[wi++] = a;
      indices[wi++] = b;
      indices[wi++] = c;
      indices[wi++] = a;
      indices[wi++] = c;
      indices[wi++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export class ProjectionView {
  /**
   * @param {object} options
   * @param {string} [options.storageKey]
   * @param {number} [options.gridSegments]
   * @param {object} [options.runtimeConfig] merged for default corners from runtime.projection
   */
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? 'price-of-absolution:projectionQuad';
    this.gridSegments = options.gridSegments ?? 32;
    this.runtimeConfig = options.runtimeConfig ?? {};

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.zIndex = '0';
    canvas.style.touchAction = 'none';

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.camera.position.z = 1;
    this.camera.lookAt(0, 0, 0);

    this.video = document.createElement('video');
    this.video.loop = false;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';

    this.tex = new THREE.VideoTexture(this.video);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;

    this.quadMat = new THREE.MeshBasicMaterial({
      map: this.tex,
      color: 0x0a141f,
      side: THREE.DoubleSide
    });

    this.quadMesh = null;
    this.handleGeo = new THREE.PlaneGeometry(0.036, 0.036);
    this.handleMat = new THREE.MeshBasicMaterial({ color: 0xff8844 });
    this.handles = [];

    this.cornersPx = [];
    this.mappingMode = false;

    this.dragIndex = -1;
    this.dragGrabOffsetX = 0;
    this.dragGrabOffsetY = 0;

    this._targetVideoVolume = 0;
    this._audioUnlocked = false;
    this._onVideoMetadata = null;
    this._onVideoEnded = null;
    /** When true, video stays on frame 0 and does not play until the next load. */
    this._holdFirstFrame = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._unlockVideoAudio = this._unlockVideoAudio.bind(this);

    this.onMappingModeChange = options.onMappingModeChange ?? null;
  }

  setMappingMode(on) {
    const next = Boolean(on);
    if (next === this.mappingMode) {
      return;
    }
    this.mappingMode = next;
    this.handles.forEach((h) => {
      h.visible = this.mappingMode;
    });
    this._syncPointerEvents();
    this.onMappingModeChange?.(this.mappingMode);
  }

  _syncPointerEvents() {
    this.renderer.domElement.style.pointerEvents = this.mappingMode ? 'auto' : 'none';
  }

  setRuntimeConfig(config) {
    this.runtimeConfig = config ?? {};
  }

  /** @param {HTMLElement} parent */
  mount(parent) {
    parent.insertBefore(this.renderer.domElement, parent.firstChild);

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cornersPx = loadCorners(this.storageKey, w, h, this.runtimeConfig);

    const geo = buildSubdividedQuadGeometry(this.cornersPx, w, h, this.gridSegments, this.gridSegments);
    this.quadMesh = new THREE.Mesh(geo, this.quadMat);
    this.scene.add(this.quadMesh);

    this.handles = this.cornersPx.map(([x, y]) => {
      const m = new THREE.Mesh(this.handleGeo, this.handleMat);
      m.position.copy(pixelsToNdc(x, y, w, h));
      m.visible = this.mappingMode;
      this.scene.add(m);
      return m;
    });

    this._syncHandleScales();

    this._syncPointerEvents();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);

    for (const evt of ['pointerdown', 'keydown']) {
      document.body.addEventListener(evt, this._unlockVideoAudio, { once: true });
    }
  }

  _unlockVideoAudio() {
    this._audioUnlocked = true;
    if (this._targetVideoVolume > 0 && this.video.src) {
      this.video.muted = false;
      this.video.volume = Math.min(1, this._targetVideoVolume);
      if (!this._holdFirstFrame) {
        this.video.play().catch(() => {});
      }
    }
  }

  _detachVideoPlaybackListeners() {
    if (this._onVideoMetadata) {
      this.video.removeEventListener('loadedmetadata', this._onVideoMetadata);
      this._onVideoMetadata = null;
    }
    if (this._onVideoEnded) {
      this.video.removeEventListener('ended', this._onVideoEnded);
      this._onVideoEnded = null;
    }
  }

  /**
   * @param {string} [path] public URL e.g. /opening.mp4
   * @param {object} [options]
   * @param {boolean} [options.loop]
   * @param {boolean} [options.holdFirstFrame]
   * @param {function(number): void} [options.onClipDurationSeconds]
   * @param {function(): void} [options.onEnded]
   */
  setBackgroundVideo(path, videoVolume = 0, options = {}) {
    const { loop = false, holdFirstFrame = false, onClipDurationSeconds, onEnded } = options;
    this._detachVideoPlaybackListeners();

    this._holdFirstFrame = Boolean(holdFirstFrame);
    this._targetVideoVolume = videoVolume;
    this.video.loop = Boolean(loop);

    if (!path) {
      this._holdFirstFrame = false;
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.quadMat.map = null;
      this.quadMat.color.setHex(0x0a141f);
      this.quadMat.needsUpdate = true;
      return;
    }

    this.quadMat.map = this.tex;
    this.quadMat.color.setHex(0xffffff);
    this.quadMat.needsUpdate = true;

    this._onVideoMetadata = () => {
      const d = this.video.duration;
      if (Number.isFinite(d) && d > 0 && d < 86400) {
        onClipDurationSeconds?.(d);
      }
      if (this._holdFirstFrame) {
        try {
          this.video.currentTime = 0;
        } catch {
          /* ignore */
        }
        this.video.pause();
      }
    };

    this.video.addEventListener('loadedmetadata', this._onVideoMetadata);
    if (!this._holdFirstFrame) {
      this._onVideoEnded = () => onEnded?.();
      this.video.addEventListener('ended', this._onVideoEnded);
    }

    this.video.src = path;
    this.video.loop = Boolean(loop);
    this.video.volume = Math.min(1, Math.max(0, videoVolume));
    this.video.muted = videoVolume <= 0 || !this._audioUnlocked;

    if (this._holdFirstFrame) {
      this.video.pause();
      const freezeOnFrame0 = () => {
        try {
          this.video.currentTime = 0;
        } catch {
          /* ignore */
        }
        this.video.pause();
      };
      this.video.addEventListener('loadeddata', freezeOnFrame0, { once: true });
    } else {
      this.video.play().catch(() => {});
    }
  }

  /**
   * Move playback so ~secondsLeft remains (aligns with tablet when timer is synced to clip length).
   * @param {number} secondsLeft
   * @param {object} [options]
   * @param {boolean} [options.allowRewind=true] If false, never seek to an earlier currentTime (debug skip).
   * @returns {boolean}
   */
  seekVideoToTimeLeft(secondsLeft, options = {}) {
    if (this._holdFirstFrame) {
      return false;
    }
    const allowRewind = options.allowRewind !== false;
    const v = this.video;
    if (!v?.src) {
      return false;
    }
    const apply = () => {
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) {
        return false;
      }
      const left = Math.max(0, secondsLeft);
      let t = Math.max(0, Math.min(d - 0.05, d - left));
      if (!allowRewind) {
        t = Math.max(v.currentTime, t);
      }
      try {
        v.currentTime = t;
      } catch {
        return false;
      }
      v.play().catch(() => {});
      return true;
    };
    if (apply()) {
      return true;
    }
    v.addEventListener(
      'loadedmetadata',
      () => {
        apply();
      },
      { once: true }
    );
    return false;
  }

  _refreshQuadGeometry() {
    if (!this.quadMesh) {
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.quadMesh.geometry.dispose();
    this.quadMesh.geometry = buildSubdividedQuadGeometry(
      this.cornersPx,
      w,
      h,
      this.gridSegments,
      this.gridSegments
    );
    this.cornersPx.forEach((c, i) => {
      const ndc = pixelsToNdc(c[0], c[1], w, h);
      this.handles[i].position.copy(ndc);
    });
    this._syncHandleScales();
    saveCorners(this.storageKey, this.cornersPx);
  }

  _syncHandleScales() {
    const aw = window.innerWidth;
    const ah = window.innerHeight;
    if (ah <= 0 || this.handles.length === 0) {
      return;
    }
    const aspect = aw / ah;
    const sx = 1 / aspect;
    this.handles.forEach((m) => m.scale.set(sx, 1, 1));
  }

  _pickCornerIndex(clientX, clientY) {
    let best = -1;
    let bestDist = Infinity;
    this.cornersPx.forEach(([cx, cy], i) => {
      const d = Math.hypot(clientX - cx, clientY - cy);
      if (d <= HANDLE_HIT_PX && d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  _onPointerDown(e) {
    if (!this.mappingMode) {
      return;
    }
    this.dragIndex = this._pickCornerIndex(e.clientX, e.clientY);
    if (this.dragIndex < 0) {
      return;
    }
    const [cx, cy] = this.cornersPx[this.dragIndex];
    this.dragGrabOffsetX = cx - e.clientX;
    this.dragGrabOffsetY = cy - e.clientY;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this.mappingMode || this.dragIndex < 0) {
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cornersPx[this.dragIndex] = [
      Math.max(0, Math.min(w, e.clientX + this.dragGrabOffsetX)),
      Math.max(0, Math.min(h, e.clientY + this.dragGrabOffsetY))
    ];
    this._refreshQuadGeometry();
  }

  _onPointerUp(e) {
    if (this.dragIndex >= 0) {
      try {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }
    this.dragIndex = -1;
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cornersPx = this.cornersPx.map(([x, y]) => [Math.min(x, w - 1), Math.min(y, h - 1)]);
    this._refreshQuadGeometry();
  }

  _onKeyDown(e) {
    if (e.repeat) {
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      this.setMappingMode(!this.mappingMode);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.cornersPx = defaultCorners(w, h);
      this._refreshQuadGeometry();
      return;
    }
    if (e.key === '[') {
      this.gridSegments = Math.max(2, this.gridSegments - 4);
      this._refreshQuadGeometry();
      return;
    }
    if (e.key === ']') {
      this.gridSegments = Math.min(128, this.gridSegments + 4);
      this._refreshQuadGeometry();
    }
  }

  /** Call every frame from p5 draw (before p5 clears). */
  render() {
    if (this.quadMat.map && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.tex.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
