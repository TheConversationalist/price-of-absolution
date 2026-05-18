import './tabletFullscreen.js';
import p5 from 'p5';
import story from '@shared/story/story.json' assert { type: 'json' };
import runtime from '@shared/config/runtime.json' assert { type: 'json' };
import { getSyncServerUrl } from '@shared/network/syncServerUrl.js';
import { NetworkClient } from './networkClient.js';
import { CountdownTimer } from './countdown.js';
import hartingFontUrl from '../../assets/fonts/harting/HartingPlain.ttf?url';
import tabletBgUrl from '../../assets/ui/background.avif?url';

const sceneMap = new Map(story.scenes.map((scene) => [scene.sceneId, scene]));
let currentSceneId = story.startSceneId;
const logLines = [];

function pushLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logLines.unshift(`${timestamp} - ${message}`);
  if (logLines.length > 8) {
    logLines.pop();
  }
  console.log(`[tablet] ${message}`);
}

let lastClipDurationSeconds = null;

const network = new NetworkClient(getSyncServerUrl(runtime.network.serverUrl), {
  onOpen: () => pushLog('Connected to sync server'),
  onClose: () => pushLog('Disconnected from sync server; reconnecting'),
  onEvent: (event) => {
    if (event.type === 'sceneChanged' && event.payload?.sceneId) {
      currentSceneId = event.payload.sceneId;
      const p = event.payload;
      if (typeof p.clipDurationSeconds === 'number' && p.clipDurationSeconds > 0) {
        lastClipDurationSeconds = p.clipDurationSeconds;
      } else if (Object.prototype.hasOwnProperty.call(p, 'clipDurationSeconds') && p.clipDurationSeconds === null) {
        lastClipDurationSeconds = null;
      }
      restartTimer();
      pushLog(`Scene synced from book: ${currentSceneId}`);
    }

    if (event.type === 'sceneSync' && event.payload?.sceneId) {
      currentSceneId = event.payload.sceneId;
      if (typeof event.payload.clipDurationSeconds === 'number' && event.payload.clipDurationSeconds > 0) {
        lastClipDurationSeconds = event.payload.clipDurationSeconds;
      } else {
        lastClipDurationSeconds = null;
      }
      restartTimer();
      pushLog(`Scene snapshot received: ${currentSceneId}`);
    }
  }
});

const timer = new CountdownTimer(() => {
  network.send('timeoutExpired', { sceneId: currentSceneId });
  pushLog('Scene timer expired (no choice); book advances via onTimeout');
});

function getCurrentScene() {
  return sceneMap.get(currentSceneId) ?? sceneMap.get(story.startSceneId);
}

function getChoicesRevealSeconds(scene) {
  const v = scene.choicesRevealSecondsBeforeEnd;
  if (typeof v === 'number' && v >= 1) {
    return v;
  }
  const d = runtime.defaultChoicesRevealSecondsBeforeEnd;
  if (typeof d === 'number' && d >= 1) {
    return d;
  }
  return 8;
}

function choicesAreVisible(scene) {
  if (!scene) {
    return false;
  }
  const n = scene.choices?.length ?? 0;
  if (n === 0) {
    return false;
  }
  if (scene.hideTabletTimer === true) {
    return true;
  }
  return timer.getSecondsLeft() <= getChoicesRevealSeconds(scene);
}

function restartTimer() {
  const scene = getCurrentScene();
  if (!scene) {
    timer.stopQuietly();
    return;
  }
  if (scene.hideTabletTimer === true) {
    lastClipDurationSeconds = null;
    timer.stopQuietly();
    return;
  }
  let seconds = scene.timeoutSeconds ?? runtime.defaultTimeoutSeconds;
  if (
    runtime.playback?.syncTabletTimerToVideo !== false &&
    lastClipDurationSeconds != null &&
    lastClipDurationSeconds > 0
  ) {
    seconds = lastClipDurationSeconds;
  }
  timer.start(seconds);
}

function choose(choiceId) {
  const scene = getCurrentScene();
  if (!scene.choices || scene.choices.length === 0) {
    return;
  }
  if (!choicesAreVisible(scene)) {
    return;
  }

  const choice = scene.choices.find((entry) => entry.id === choiceId);
  if (!choice) {
    return;
  }

  currentSceneId = choice.targetSceneId;
  lastClipDurationSeconds = null;
  network.send('chooseOption', { choiceId, sceneId: scene.sceneId });
  restartTimer();
  pushLog(`Choice selected: ${choice.label}`);
}

function debugSkipToPreReveal() {
  const scene = getCurrentScene();
  if (!scene?.choices?.length) {
    return;
  }
  const reveal = getChoicesRevealSeconds(scene);
  const lead = 10;
  const target = reveal + lead;
  if (timer.getSecondsLeft() <= target) {
    pushLog(`Debug skip: already ≤ ${target}s left`);
    return;
  }
  timer.setSecondsRemaining(target);
  network.send('debugSkipToPreReveal', {
    sceneId: currentSceneId,
    secondsLeft: target
  });
  pushLog(`Debug skip: ~${target}s left (${reveal}s reveal + ${lead})`);
}

/** Scale for all controller typography and touch targets. */
const UI_SCALE = 2;

/** Layout for branch buttons: two columns when there are exactly 2 choices. */
const CHOICE_PAD = 22 * UI_SCALE;
const CHOICE_GAP = 32 * UI_SCALE;
const CHOICE_MARGIN = 40 * UI_SCALE;
const CHOICE_CORNER = 16 * UI_SCALE;
const CHOICE_TEXT = 34 * UI_SCALE;
const CHOICE_MIN_H = 128 * UI_SCALE;
const CHOICE_ROW_GAP = 28 * UI_SCALE;
const CHOICES_TOP = 328 * UI_SCALE;

function wrapLabelLines(p5, label, maxW) {
  const words = String(label)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const test = `${cur} ${w}`;
    if (p5.textWidth(test) <= maxW) {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  return lines;
}

function measureUniformChoiceHeight(p5, labels, innerW, pad, lineLead) {
  let maxLines = 1;
  for (const lb of labels) {
    maxLines = Math.max(maxLines, wrapLabelLines(p5, lb, innerW).length);
  }
  return Math.max(CHOICE_MIN_H, pad * 2 + maxLines * lineLead);
}

function drawOutlinedChoiceCell(p5, x, y, w, h, lines, rgbStroke, rgbFill, corner, opts = {}) {
  const pressed = opts.pressed === true;
  const lineLead = CHOICE_TEXT * 1.35;
  const strokeRgb = pressed
    ? rgbStroke.map((c) => Math.min(255, Math.round(c + 45)))
    : rgbStroke;
  const textRgb = pressed
    ? rgbFill.map((c) => Math.min(255, Math.round(c + 25)))
    : rgbFill;

  p5.push();
  if (pressed) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    p5.translate(cx, cy);
    p5.scale(0.96);
    p5.translate(-cx, -cy);
  }

  p5.noFill();
  p5.stroke(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
  p5.strokeWeight((pressed ? 3.1 : 2.75) * UI_SCALE);
  p5.rect(x, y, w, h, corner);
  p5.noStroke();
  const blockH = lines.length * lineLead;
  const cx = x + w / 2;
  let ty = y + (h - blockH) / 2 + lineLead * 0.72;
  p5.fill(textRgb[0], textRgb[1], textRgb[2]);
  p5.textAlign(p5.CENTER, p5.BASELINE);
  for (const line of lines) {
    p5.text(line, cx, ty);
    ty += lineLead;
  }
  p5.pop();
}

function pointInRect(p5, rx, ry, rw, rh) {
  return p5.mouseX >= rx && p5.mouseX <= rx + rw && p5.mouseY >= ry && p5.mouseY <= ry + rh;
}

function isPointerDownOnButton(p5, rx, ry, rw, rh) {
  return Boolean(p5.mouseIsPressed && pointInRect(p5, rx, ry, rw, rh));
}

const TIMER_BAR_GAP = 28 * UI_SCALE;
const TIMER_BAR_STROKE = 6 * UI_SCALE;
const TIMER_BAR_MARGIN = CHOICE_MARGIN;

function measureChoiceBlockHeight(p5, scene) {
  const n = scene.choices.length;
  p5.push();
  p5.textSize(CHOICE_TEXT);
  p5.textStyle(p5.BOLD);
  const lineLead = CHOICE_TEXT * 1.35;
  const labels = scene.choices.map((c) => c.label);
  let totalH;
  if (n === 2) {
    const colW = (p5.width - 2 * CHOICE_MARGIN - CHOICE_GAP) / 2;
    const innerW = colW - 2 * CHOICE_PAD;
    totalH = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
  } else if (n === 1) {
    const fullBand = p5.width - 2 * CHOICE_MARGIN;
    const btnW = fullBand / 2;
    const innerW = btnW - 2 * CHOICE_PAD;
    totalH = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
  } else if (n > 0) {
    const fullW = p5.width - 2 * CHOICE_MARGIN;
    const innerW = fullW - 2 * CHOICE_PAD;
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    totalH = n * H + Math.max(0, n - 1) * CHOICE_ROW_GAP;
  } else {
    totalH = 0;
  }
  p5.textStyle(p5.NORMAL);
  p5.pop();
  return totalH;
}

function drawSymmetricalTimerBar(p5, y, fractionRemaining) {
  const cx = p5.width / 2;
  const trackHalf = (p5.width - 2 * TIMER_BAR_MARGIN) / 2;
  const halfLen = trackHalf * Math.min(1, Math.max(0, fractionRemaining));
  if (halfLen < UI_SCALE * 0.5) {
    return;
  }
  p5.push();
  p5.drawingContext.lineCap = 'round';
  p5.stroke(30, 58, 90);
  p5.strokeWeight(TIMER_BAR_STROKE);
  p5.line(cx - halfLen, y, cx + halfLen, y);
  p5.pop();
}

/** @returns {{ areas: object[], bottom: number }} */
function drawInteractiveChoices(p5, scene, topY = CHOICES_TOP) {
  p5.textSize(CHOICE_TEXT);
  p5.textStyle(p5.BOLD);
  const lineLead = CHOICE_TEXT * 1.35;
  const strokeRgb = [30, 58, 90];
  const fillRgb = [15, 26, 42];
  const n = scene.choices.length;
  const areas = [];
  let choicesBottom = topY;

  if (n === 2) {
    const colW = (p5.width - 2 * CHOICE_MARGIN - CHOICE_GAP) / 2;
    const innerW = colW - 2 * CHOICE_PAD;
    const labels = scene.choices.map((c) => c.label);
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    for (let i = 0; i < 2; i++) {
      const colX = CHOICE_MARGIN + i * (colW + CHOICE_GAP);
      const lines = wrapLabelLines(p5, labels[i], innerW);
      drawOutlinedChoiceCell(p5, colX, topY, colW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER, {
        pressed: isPointerDownOnButton(p5, colX, topY, colW, H)
      });
      areas.push({ ...scene.choices[i], x: colX, y: topY, w: colW, h: H });
    }
    choicesBottom = topY + H;
  } else if (n === 1) {
    const fullBand = p5.width - 2 * CHOICE_MARGIN;
    const btnW = fullBand / 2;
    const innerW = btnW - 2 * CHOICE_PAD;
    const labels = scene.choices.map((c) => c.label);
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    const colX = (p5.width - btnW) / 2;
    const lines = wrapLabelLines(p5, labels[0], innerW);
    drawOutlinedChoiceCell(p5, colX, topY, btnW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER, {
      pressed: isPointerDownOnButton(p5, colX, topY, btnW, H)
    });
    areas.push({ ...scene.choices[0], x: colX, y: topY, w: btnW, h: H });
    choicesBottom = topY + H;
  } else {
    const fullW = p5.width - 2 * CHOICE_MARGIN;
    const innerW = fullW - 2 * CHOICE_PAD;
    const labels = scene.choices.map((c) => c.label);
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    let y = topY;
    for (let i = 0; i < n; i++) {
      const lines = wrapLabelLines(p5, labels[i], innerW);
      drawOutlinedChoiceCell(p5, CHOICE_MARGIN, y, fullW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER, {
        pressed: isPointerDownOnButton(p5, CHOICE_MARGIN, y, fullW, H)
      });
      areas.push({ ...scene.choices[i], x: CHOICE_MARGIN, y, w: fullW, h: H });
      y += H + CHOICE_ROW_GAP;
    }
    choicesBottom = n > 0 ? y - CHOICE_ROW_GAP : topY;
  }
  p5.textStyle(p5.NORMAL);
  return { areas, bottom: choicesBottom };
}

/** @returns {number} bottom Y of choice block */
function drawLockedChoicePreview(p5, scene, topY = CHOICES_TOP) {
  p5.textSize(CHOICE_TEXT);
  p5.textStyle(p5.BOLD);
  const lineLead = CHOICE_TEXT * 1.35;
  const strokeRgb = [100, 116, 139];
  const fillRgb = [80, 90, 106];
  const n = scene.choices.length;
  const labels = scene.choices.map((c) => `Locked · ${c.label}`);
  let choicesBottom = topY;

  if (n === 2) {
    const colW = (p5.width - 2 * CHOICE_MARGIN - CHOICE_GAP) / 2;
    const innerW = colW - 2 * CHOICE_PAD;
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    for (let i = 0; i < 2; i++) {
      const colX = CHOICE_MARGIN + i * (colW + CHOICE_GAP);
      const lines = wrapLabelLines(p5, labels[i], innerW);
      drawOutlinedChoiceCell(p5, colX, topY, colW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER);
    }
    choicesBottom = topY + H;
  } else if (n === 1) {
    const fullBand = p5.width - 2 * CHOICE_MARGIN;
    const btnW = fullBand / 2;
    const innerW = btnW - 2 * CHOICE_PAD;
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    const colX = (p5.width - btnW) / 2;
    const lines = wrapLabelLines(p5, labels[0], innerW);
    drawOutlinedChoiceCell(p5, colX, topY, btnW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER);
    choicesBottom = topY + H;
  } else {
    const fullW = p5.width - 2 * CHOICE_MARGIN;
    const innerW = fullW - 2 * CHOICE_PAD;
    const H = measureUniformChoiceHeight(p5, labels, innerW, CHOICE_PAD, lineLead);
    let y = topY;
    for (let i = 0; i < n; i++) {
      const lines = wrapLabelLines(p5, labels[i], innerW);
      drawOutlinedChoiceCell(p5, CHOICE_MARGIN, y, fullW, H, lines, strokeRgb, fillRgb, CHOICE_CORNER);
      y += H + CHOICE_ROW_GAP;
    }
    choicesBottom = n > 0 ? y - CHOICE_ROW_GAP : topY;
  }
  p5.textStyle(p5.NORMAL);
  return choicesBottom;
}

new p5((p) => {
  let buttonAreas = [];
  let debugSkipPreRevealBtn = null;
  let uiFont;
  let tabletBg;
  let debugMode = false;
  /** @type {{ x: number, y: number, w: number, h: number, corner: number, startMs: number } | null} */
  let pressBurst = null;

  function triggerPressBurst(x, y, w, h, corner) {
    pressBurst = {
      x,
      y,
      w,
      h,
      corner: Math.max(0, corner),
      startMs: performance.now()
    };
  }

  function drawPressBurstLayer() {
    if (!pressBurst) {
      return;
    }
    const elapsed = performance.now() - pressBurst.startMs;
    const dur = 380;
    if (elapsed >= dur) {
      pressBurst = null;
      return;
    }
    const t = elapsed / dur;
    const grow = 1 - (1 - t) ** 2.1;
    const scale = 1 + 0.22 * grow;
    const fade = (1 - t) ** 1.25;
    const alphaFill = 115 * fade;
    const alphaStroke = 140 * fade;

    const { x, y, w, h, corner } = pressBurst;
    const cx = x + w / 2;
    const cy = y + h / 2;

    p.push();
    p.translate(cx, cy);
    p.scale(scale);
    p.translate(-cx, -cy);
    p.stroke(28, 72, 118, alphaStroke);
    p.strokeWeight(2.9 * UI_SCALE * fade);
    p.fill(210, 232, 255, alphaFill);
    p.rect(x, y, w, h, corner);
    p.pop();
  }

  function drawBackgroundImage() {
    if (tabletBg && tabletBg.width > 0) {
      const iw = tabletBg.width;
      const ih = tabletBg.height;
      const cw = p.width;
      const ch = p.height;
      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      p.image(tabletBg, ox, oy, dw, dh);
    } else {
      p.background(235, 238, 244);
    }
  }

  function onDebugKeydown(e) {
    if (e.repeat) {
      return;
    }
    if (e.key !== 'd' && e.key !== 'D') {
      return;
    }
    debugMode = !debugMode;
    pushLog(`Debug mode ${debugMode ? 'on' : 'off'} (D)`);
  }

  p.preload = () => {
    uiFont = p.loadFont(hartingFontUrl);
    tabletBg = p.loadImage(tabletBgUrl);
  };

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('app');
    p.textFont(uiFont ?? 'Arial');
    window.addEventListener('keydown', onDebugKeydown);
    restartTimer();
    network.connect();
  };

  p.draw = () => {
    timer.update();
    debugSkipPreRevealBtn = null;
    drawBackgroundImage();
    const scene = getCurrentScene();
    const hasChoices = scene.choices && scene.choices.length > 0;
    const visible = choicesAreVisible(scene);
    const secondsLeft = timer.getSecondsLeft();
    const reveal = getChoicesRevealSeconds(scene);

    if (!debugMode && (!hasChoices || !visible)) {
      buttonAreas = [];
      drawPressBurstLayer();
      return;
    }

    if (!debugMode && hasChoices && visible) {
      buttonAreas = [];
      const barReserve = scene.hideTabletTimer
        ? 0
        : TIMER_BAR_GAP + TIMER_BAR_STROKE + 8 * UI_SCALE;
      const blockH = measureChoiceBlockHeight(p, scene);
      const topY = Math.max(24 * UI_SCALE, (p.height - blockH - barReserve) / 2);
      const layout = drawInteractiveChoices(p, scene, topY);
      buttonAreas = layout.areas;
      if (!scene.hideTabletTimer) {
        drawSymmetricalTimerBar(
          p,
          layout.bottom + TIMER_BAR_GAP,
          timer.getTimeFractionRemaining()
        );
      }
      drawPressBurstLayer();
      return;
    }

    if (debugMode) {
      p.fill(94, 70, 12);
      p.textSize(17 * UI_SCALE);
      p.textAlign(p.RIGHT, p.TOP);
      p.text('[DEBUG · D hides]', p.width - 40 * UI_SCALE, 16 * UI_SCALE);
      p.textAlign(p.LEFT, p.BASELINE);

      if (hasChoices && secondsLeft > reveal + 10 && !scene.hideTabletTimer) {
        const bx = p.width - 268 * UI_SCALE;
        const by = 44 * UI_SCALE;
        const bw = 236 * UI_SCALE;
        const bh = 40 * UI_SCALE;
        const dbgPressed = isPointerDownOnButton(p, bx, by, bw, bh);
        p.push();
        if (dbgPressed) {
          const cx = bx + bw / 2;
          const cy = by + bh / 2;
          p.translate(cx, cy);
          p.scale(0.96);
          p.translate(-cx, -cy);
        }
        p.noFill();
        p.stroke(94, 70, 12, dbgPressed ? 255 : 230);
        p.strokeWeight((dbgPressed ? 2.6 : 2) * UI_SCALE);
        p.rect(bx, by, bw, bh, 8 * UI_SCALE);
        p.noStroke();
        p.fill(dbgPressed ? 48 : 62, dbgPressed ? 36 : 48, dbgPressed ? 6 : 8);
        p.textSize(15 * UI_SCALE);
        p.textAlign(p.LEFT, p.CENTER);
        p.text(`Skip → ${reveal + 10}s left (10s pre-reveal)`, bx + 14 * UI_SCALE, by + bh / 2 + 1 * UI_SCALE);
        p.textAlign(p.LEFT, p.BASELINE);
        p.pop();
        debugSkipPreRevealBtn = { x: bx, y: by, w: bw, h: bh };
      }
    }

    p.fill(20, 24, 32);
    p.textSize(30 * UI_SCALE);
    p.text('The Price of Absolution — controller', 40 * UI_SCALE, 56 * UI_SCALE);

    p.fill(30, 58, 90);
    p.textSize(21 * UI_SCALE);
    p.text(`Scene: ${scene.sceneId}`, 40 * UI_SCALE, 96 * UI_SCALE);

    if (debugMode) {
      p.textSize(16 * UI_SCALE);
      p.fill(55, 75, 98);
      const clip =
        typeof lastClipDurationSeconds === 'number' && lastClipDurationSeconds > 0
          ? `${lastClipDurationSeconds.toFixed(1)}s (synced)`
          : '—';
      p.text(
        `Choices: ${hasChoices ? scene.choices.length : 0} · visible: ${visible} · clip: ${clip}`,
        40 * UI_SCALE,
        122 * UI_SCALE,
        p.width - 80 * UI_SCALE,
        48 * UI_SCALE
      );
    }

    p.fill(22, 26, 34);
    p.textSize(24 * UI_SCALE);
    p.text(
      scene.displayText,
      40 * UI_SCALE,
      debugMode ? 156 * UI_SCALE : 140 * UI_SCALE,
      p.width - 80 * UI_SCALE,
      120 * UI_SCALE
    );

    p.fill(secondsLeft <= 5 ? '#9b1c1c' : '#0a4d6e');
    p.textSize(46 * UI_SCALE);
    p.text(`Time Left: ${secondsLeft}s`, 40 * UI_SCALE, 300 * UI_SCALE);

    if (debugMode && !hasChoices) {
      p.fill(55, 65, 80);
      p.textSize(20 * UI_SCALE);
      p.text(
        'Linear beat — no choices; book advances after this clip / timeout.',
        40 * UI_SCALE,
        352 * UI_SCALE
      );
    }

    if (debugMode && hasChoices && !visible) {
      const until = Math.max(0, secondsLeft - reveal);
      p.fill(55, 65, 80);
      p.textSize(20 * UI_SCALE);
      p.text(
        `Choices locked — unlock in ~${until}s (last ${reveal}s of beat)`,
        40 * UI_SCALE,
        352 * UI_SCALE,
        p.width - 80 * UI_SCALE,
        52 * UI_SCALE
      );
    }

    let choicesBlockEnd = 400 * UI_SCALE;
    buttonAreas = [];
    if (hasChoices && visible) {
      const layout = drawInteractiveChoices(p, scene, CHOICES_TOP);
      buttonAreas = layout.areas;
      choicesBlockEnd = layout.bottom + 24 * UI_SCALE;
    } else if (debugMode && hasChoices && !visible) {
      const bottom = drawLockedChoicePreview(p, scene, CHOICES_TOP);
      choicesBlockEnd = bottom + 24 * UI_SCALE;
    }

    p.fill(255, 255, 255, 200);
    const logTop = Math.min(p.height - 230 * UI_SCALE, choicesBlockEnd);
    p.rect(32 * UI_SCALE, logTop, p.width - 64 * UI_SCALE, 190 * UI_SCALE, 8 * UI_SCALE);
    p.fill(30, 41, 59);
    p.textSize(16 * UI_SCALE);
    logLines.forEach((line, index) => {
      p.text(line, 48 * UI_SCALE, logTop + 34 * UI_SCALE + index * 20 * UI_SCALE);
    });

    drawPressBurstLayer();
  };

  p.mousePressed = () => {
    if (debugSkipPreRevealBtn) {
      const b = debugSkipPreRevealBtn;
      const withinX = p.mouseX >= b.x && p.mouseX <= b.x + b.w;
      const withinY = p.mouseY >= b.y && p.mouseY <= b.y + b.h;
      if (withinX && withinY) {
        triggerPressBurst(b.x, b.y, b.w, b.h, 8 * UI_SCALE);
        debugSkipToPreReveal();
        return;
      }
    }
    for (const button of buttonAreas) {
      const withinX = p.mouseX >= button.x && p.mouseX <= button.x + button.w;
      const withinY = p.mouseY >= button.y && p.mouseY <= button.y + button.h;
      if (withinX && withinY) {
        triggerPressBurst(button.x, button.y, button.w, button.h, CHOICE_CORNER);
        choose(button.id);
        return;
      }
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
});
