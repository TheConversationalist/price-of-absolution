/**
 * Continuous wind / ambience bed with overlap crossfade at loop seams (two decoders).
 * Fade overlaps the tail of the outgoing pass with the start of the incoming pass.
 */

const DEFAULT_CROSSFADE_SEC = 1.2;
const START_FADE_IN_MS = 500;

/**
 * @param {object} options
 * @param {string} options.url
 * @param {number} options.peakVolume 0..1
 * @param {number} [options.crossfadeSeconds]
 * @returns {{ stop: () => void, resumeFromUserGesture: () => void }}
 */
export function startWindBed(options) {
  const url = options.url;
  const peak = Math.max(0, Math.min(1, options.peakVolume ?? 0.18));
  const crossfadeAsk = Math.max(
    0.35,
    Math.min(8, options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SEC)
  );

  const a = new Audio();
  const b = new Audio();
  a.preload = 'auto';
  b.preload = 'auto';
  a.src = url;
  b.src = url;

  let lead = a;
  let follow = b;
  let swapping = false;
  let starting = true;
  let stopped = false;
  let raf = 0;

  function cancelRaf() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function setPairVolumes(leadVol, followVol) {
    lead.volume = Math.max(0, Math.min(1, leadVol));
    follow.volume = Math.max(0, Math.min(1, followVol));
  }

  function tick() {
    if (stopped) {
      return;
    }
    const d = lead.duration;
    if (!Number.isFinite(d) || d <= 0) {
      raf = requestAnimationFrame(tick);
      return;
    }

    const x = Math.min(crossfadeAsk, d * 0.45);
    const left = d - lead.currentTime;

    if (!swapping && left <= x && left > 0) {
      swapping = true;
      follow.currentTime = 0;
      follow.volume = 0;
      follow.play().catch(() => {});
    }

    if (swapping && left <= x) {
      const p = Math.max(0, Math.min(1, x > 0.001 ? left / x : 0));
      setPairVolumes(peak * p, peak * (1 - p));
    } else if (!swapping && !starting) {
      setPairVolumes(peak, 0);
    }

    raf = requestAnimationFrame(tick);
  }

  function onAnyEnded(ev) {
    if (stopped || ev.target !== lead) {
      return;
    }
    const oldLead = lead;
    const oldFollow = follow;
    oldLead.pause();
    oldLead.currentTime = 0;
    oldLead.volume = 0;
    lead = oldFollow;
    follow = oldLead;
    swapping = false;
    starting = false;
    setPairVolumes(peak, 0);
  }

  a.addEventListener('ended', onAnyEnded);
  b.addEventListener('ended', onAnyEnded);

  function rampStartVolume() {
    starting = true;
    const el = lead;
    const t0 = performance.now();
    el.volume = 0;
    function step() {
      if (stopped) {
        return;
      }
      const t = (performance.now() - t0) / START_FADE_IN_MS;
      if (t >= 1) {
        el.volume = peak;
        starting = false;
        return;
      }
      el.volume = peak * t;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const run = () => {
    if (stopped) {
      return;
    }
    lead.loop = false;
    follow.loop = false;
    starting = true;
    lead.volume = 0;
    follow.volume = 0;
    lead
      .play()
      .then(rampStartVolume)
      .catch(() => {
        const retry = () => {
          if (stopped) {
            return;
          }
          lead.play().then(rampStartVolume).catch(() => {});
        };
        window.addEventListener('pointerdown', retry, { once: true });
        window.addEventListener('keydown', retry, { once: true });
      });
    raf = requestAnimationFrame(tick);
  };

  if (lead.readyState >= HTMLMediaElement.HAVE_METADATA) {
    run();
  } else {
    lead.addEventListener('loadeddata', run, { once: true });
    lead.addEventListener(
      'error',
      () => {
        console.warn('[windBed] failed to load', url);
      },
      { once: true }
    );
  }

  return {
    resumeFromUserGesture() {
      if (stopped) {
        return;
      }
      lead.play().catch(() => {});
      follow.play().catch(() => {});
    },
    stop() {
      stopped = true;
      cancelRaf();
      a.removeEventListener('ended', onAnyEnded);
      b.removeEventListener('ended', onAnyEnded);
      lead.pause();
      follow.pause();
      lead.removeAttribute('src');
      follow.removeAttribute('src');
      lead.load();
      follow.load();
    }
  };
}
