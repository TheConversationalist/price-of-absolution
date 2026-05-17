/**
 * Invisible top-right tap sequence toggles fullscreen (Android Chrome + best-effort elsewhere).
 * Five taps within CONTROLLER_FS_TAP_WINDOW_MS; toast from tap 3 onward.
 */

const CONTROLLER_FS_TAP_WINDOW_MS = 850;
const CONTROLLER_FS_TAPS_REQUIRED = 5;
const FS_FEEDBACK_VISIBLE_MS = 2600;

const fsZone = document.getElementById('tablet-fs-zone');
const fsFeedbackEl = document.getElementById('tablet-fs-feedback');

let fsTapCount = 0;
let fsTapResetTimer = null;
let fsFeedbackHideTimer = null;
/** Same tap fires pointerdown then click on some Android browsers — count once. */
let fsSuppressClickUntilMs = 0;

function showFsFeedback(message) {
  if (!fsFeedbackEl || !message) {
    return;
  }
  fsFeedbackEl.textContent = message;
  fsFeedbackEl.classList.add('is-visible');
  if (fsFeedbackHideTimer !== null) {
    clearTimeout(fsFeedbackHideTimer);
  }
  fsFeedbackHideTimer = window.setTimeout(() => {
    fsFeedbackHideTimer = null;
    fsFeedbackEl.classList.remove('is-visible');
    fsFeedbackEl.textContent = '';
  }, FS_FEEDBACK_VISIBLE_MS);
}

function noteFullscreenTapFromPointer() {
  fsSuppressClickUntilMs = Date.now() + 480;
  noteFullscreenTap();
}

function noteFullscreenTapFromClick() {
  if (Date.now() < fsSuppressClickUntilMs) {
    return;
  }
  noteFullscreenTap();
}

function resetFullscreenTapSequence() {
  fsTapCount = 0;
  if (fsTapResetTimer !== null) {
    clearTimeout(fsTapResetTimer);
    fsTapResetTimer = null;
  }
}

function controllerFullscreenNative() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

/** True if native fullscreen OR CSS fallback (iPad WebKit often no-ops requestFullscreen). */
function controllerFullscreenEffective() {
  return (
    controllerFullscreenNative() ||
    document.body.classList.contains('tablet-faux-fullscreen')
  );
}

function enableFauxFullscreen() {
  document.body.classList.add('tablet-faux-fullscreen');
}

function disableFauxFullscreen() {
  document.body.classList.remove('tablet-faux-fullscreen');
}

function syncFauxWithNativeFullscreen() {
  if (controllerFullscreenNative()) {
    disableFauxFullscreen();
  }
}

document.addEventListener('fullscreenchange', syncFauxWithNativeFullscreen);
document.addEventListener('webkitfullscreenchange', syncFauxWithNativeFullscreen);

function exitAllFullscreenModes() {
  disableFauxFullscreen();
  if (!controllerFullscreenNative()) {
    return;
  }
  const doc = document;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
  if (exit) {
    exit.call(doc).catch(() => {});
  }
}

function tryRequestFullscreenOn(node) {
  const req =
    node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen;
  if (!req) {
    return Promise.reject(new Error('no fullscreen'));
  }
  return req.call(node);
}

/** True when opened from Add to Home Screen (no Safari/Chrome browser chrome). */
function isStandaloneDisplayMode() {
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      return true;
    }
  }
  return window.navigator.standalone === true;
}

function verifyNativeOrFaux() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (controllerFullscreenNative()) {
          disableFauxFullscreen();
          resolve('native');
          return;
        }
        if (isStandaloneDisplayMode()) {
          disableFauxFullscreen();
          resolve('standalone-app');
          return;
        }
        enableFauxFullscreen();
        resolve('faux');
      });
    });
  });
}

/**
 * From the last tap’s user gesture. Chrome Android usually gets real fullscreen on <html>;
 * WebKit iOS often does not — faux / Home Screen paths handled after verify.
 */
function enterTabletFullscreenBestEffort() {
  const root = document.documentElement;
  const body = document.body;

  return tryRequestFullscreenOn(root)
    .catch(() => tryRequestFullscreenOn(body))
    .then(verifyNativeOrFaux)
    .catch(() => {
      if (isStandaloneDisplayMode()) {
        return 'standalone-app';
      }
      enableFauxFullscreen();
      return 'faux';
    });
}

function noteFullscreenTap() {
  fsTapCount += 1;
  if (fsTapResetTimer !== null) {
    clearTimeout(fsTapResetTimer);
  }
  fsTapResetTimer = window.setTimeout(() => {
    fsTapResetTimer = null;
    fsTapCount = 0;
  }, CONTROLLER_FS_TAP_WINDOW_MS);

  if (fsTapCount >= CONTROLLER_FS_TAPS_REQUIRED) {
    const willExitFullscreen = controllerFullscreenEffective();
    resetFullscreenTapSequence();
    if (willExitFullscreen) {
      exitAllFullscreenModes();
      showFsFeedback('Leaving fullscreen…');
      return;
    }
    enterTabletFullscreenBestEffort().then((mode) => {
      if (mode === 'native') {
        showFsFeedback('Fullscreen on.');
        return;
      }
      if (mode === 'standalone-app') {
        showFsFeedback('Opened from Home Screen — browser bars are already hidden.');
        return;
      }
      showFsFeedback(
        'Safari/Chrome cannot hide the URL bar inside a tab. Share → Add to Home Screen → open from that icon.'
      );
    });
    return;
  }

  if (fsTapCount >= 3) {
    const remaining = CONTROLLER_FS_TAPS_REQUIRED - fsTapCount;
    const exiting = controllerFullscreenEffective();
    const goal = exiting ? 'to exit fullscreen' : 'for fullscreen';
    showFsFeedback(
      remaining === 1
        ? `Tap 1 more time ${goal}.`
        : `Tap ${remaining} more times ${goal}.`
    );
  }
}

if (fsZone) {
  fsZone.addEventListener('pointerdown', noteFullscreenTapFromPointer, {
    passive: true
  });
  fsZone.addEventListener('click', noteFullscreenTapFromClick);
}
