/**
 * Optional exhibit music bed: dual-decoder crossfade loop, manual start with fade-in,
 * fade-to-silent then stop (e.g. on title screen).
 */

const DEFAULT_CROSSFADE_SEC = 1.2;

/**
 * @param {object} options
 * @param {string} options.url
 * @param {number} options.volume Base peak 0..1 (before global gain)
 * @param {number} [options.crossfadeSeconds]
 * @param {number} [options.startFadeInMs] Ramp gain 0→1 when start() runs
 * @returns {{
 *   start: (opts?: { silent?: boolean }) => void,
 *   rampForegroundGain: (durationMs?: number) => void,
 *   fadeOut: (durationMs: number, onDone?: () => void) => void,
 *   stop: () => void,
 *   resumeFromUserGesture: () => void
 * }}
 */
export function createDramaticLoopBed(options) {
  const url = options.url;
  const peakBase = Math.max(0, Math.min(1, options.volume ?? 0.14));
  const crossfadeAsk = Math.max(
    0.35,
    Math.min(8, options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SEC)
  );
  const startFadeInMs = Math.max(200, options.startFadeInMs ?? 800);

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
  /** Global gain 0..1 — animates on start / fadeOut; loop tick multiplies into volumes. */
  let gainMul = 0;
  let stopped = true;
  let raf = 0;
  let gainRampRaf = 0;
  let playing = false;
  /** When true, `play()` succeeded at gain 0 — do not treat as "needs ramp" in resume. */
  let silentHold = false;

  function cancelRaf() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function cancelGainRamp() {
    if (gainRampRaf) {
      cancelAnimationFrame(gainRampRaf);
      gainRampRaf = 0;
    }
  }

  function effectivePeak() {
    return peakBase * gainMul;
  }

  function setPairVolumes(leadVol, followVol) {
    lead.volume = Math.max(0, Math.min(1, leadVol));
    follow.volume = Math.max(0, Math.min(1, followVol));
  }

  function tick() {
    if (stopped) {
      return;
    }
    const peak = effectivePeak();
    const d = lead.duration;
    // Volume must update even before metadata: gain ramp only touches gainMul; tick is what
    // applies peakBase*gainMul to the Audio elements (unlike windBed, which drives lead.volume in its ramp).
    if (!Number.isFinite(d) || d <= 0) {
      if (!swapping) {
        setPairVolumes(peak, 0);
      }
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
    } else if (!swapping) {
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
    setPairVolumes(effectivePeak(), 0);
  }

  a.addEventListener('ended', onAnyEnded);
  b.addEventListener('ended', onAnyEnded);

  function rampGain(from, to, ms, done) {
    cancelGainRamp();
    const t0 = performance.now();
    function step() {
      if (stopped) {
        return;
      }
      const u = Math.min(1, (performance.now() - t0) / ms);
      gainMul = from + (to - from) * u;
      if (u >= 1) {
        gainMul = to;
        gainRampRaf = 0;
        done?.();
        return;
      }
      gainRampRaf = requestAnimationFrame(step);
    }
    gainRampRaf = requestAnimationFrame(step);
  }

  function rampStartGain() {
    silentHold = false;
    starting = true;
    gainMul = 0;
    const el = lead;
    el.volume = 0;
    follow.volume = 0;
    rampGain(0, 1, startFadeInMs, () => {
      starting = false;
    });
  }

  function runPlayback(wantSilent) {
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
      .then(() => {
        if (stopped) {
          return;
        }
        if (wantSilent) {
          cancelGainRamp();
          gainMul = 0;
          silentHold = true;
          starting = false;
        } else {
          silentHold = false;
          rampStartGain();
        }
      })
      .catch(() => {
        const retry = () => {
          if (stopped) {
            return;
          }
          lead
            .play()
            .then(() => {
              if (stopped) {
                return;
              }
              if (wantSilent) {
                cancelGainRamp();
                gainMul = 0;
                silentHold = true;
                starting = false;
              } else {
                silentHold = false;
                rampStartGain();
              }
            })
            .catch(() => {});
        };
        window.addEventListener('pointerdown', retry, { once: true });
        window.addEventListener('keydown', retry, { once: true });
      });
    raf = requestAnimationFrame(tick);
  }

  function stopInternal() {
    stopped = true;
    playing = false;
    cancelRaf();
    cancelGainRamp();
    a.removeEventListener('ended', onAnyEnded);
    b.removeEventListener('ended', onAnyEnded);
    lead.pause();
    follow.pause();
    a.removeAttribute('src');
    b.removeAttribute('src');
    a.load();
    b.load();
    gainMul = 0;
    silentHold = false;
    swapping = false;
    starting = true;
    lead = a;
    follow = b;
    a.addEventListener('ended', onAnyEnded);
    b.addEventListener('ended', onAnyEnded);
  }

  return {
    /**
     * Begin decoding/playback. Use `{ silent: true }` inside a user-gesture handler so the
     * browser allows `play()`; the exhibit timer later calls `rampForegroundGain` (not a gesture).
     */
    start(opts = {}) {
      const wantSilent = opts.silent === true;
      if (!stopped && playing) {
        if (wantSilent) {
          cancelGainRamp();
          gainMul = 0;
          silentHold = true;
          starting = false;
          lead.play().catch(() => {});
          follow.play().catch(() => {});
        }
        return;
      }
      a.src = url;
      b.src = url;
      lead = a;
      follow = b;
      stopped = false;
      playing = true;

      const kick = () => {
        if (stopped) {
          return;
        }
        runPlayback(wantSilent);
      };

      if (lead.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        kick();
      } else {
        lead.addEventListener('loadeddata', kick, { once: true });
        lead.addEventListener(
          'error',
          () => {
            console.warn('[dramaticBed] failed to load', url);
          },
          { once: true }
        );
      }
    },

    rampForegroundGain(fadeMs) {
      const ms = Math.max(200, fadeMs ?? startFadeInMs);
      if (stopped) {
        this.start({ silent: false });
        return;
      }
      silentHold = false;
      cancelGainRamp();
      starting = true;
      const from = gainMul;
      rampGain(from, 1, ms, () => {
        starting = false;
      });
      lead.play().catch(() => {});
      follow.play().catch(() => {});
    },

    fadeOut(durationMs, onDone) {
      const ms = Math.max(100, durationMs ?? 800);
      const from = gainMul;
      cancelGainRamp();
      const t0 = performance.now();
      function stepOut() {
        if (stopped) {
          onDone?.();
          return;
        }
        const u = Math.min(1, (performance.now() - t0) / ms);
        gainMul = from * (1 - u);
        if (u >= 1) {
          gainMul = 0;
          gainRampRaf = 0;
          stopInternal();
          onDone?.();
          return;
        }
        gainRampRaf = requestAnimationFrame(stepOut);
      }
      gainRampRaf = requestAnimationFrame(stepOut);
    },

    stop() {
      stopInternal();
    },

    resumeFromUserGesture() {
      if (stopped || !playing) {
        return;
      }
      lead
        .play()
        .then(() => {
          if (stopped || silentHold) {
            return;
          }
          if (gainMul < 0.001) {
            rampStartGain();
          }
        })
        .catch(() => {});
      follow.play().catch(() => {});
    }
  };
}
