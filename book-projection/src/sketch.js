import p5 from 'p5';
import story from '@shared/story/story.json' assert { type: 'json' };
import runtime from '@shared/config/runtime.json' assert { type: 'json' };
import { getSyncServerUrl } from '@shared/network/syncServerUrl.js';
import { StoryStateMachine } from './stateMachine.js';
import { MediaEngine } from './mediaEngine.js';
import { NetworkClient } from './networkClient.js';
import { ProjectionView } from './projectionView.js';

const stateMachine = new StoryStateMachine(story);

new p5((p) => {
  const logLines = [];

  function pushLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logLines.unshift(`${timestamp} - ${message}`);
    if (logLines.length > 6) {
      logLines.pop();
    }
    console.log(`[book] ${message}`);
  }

  const projectionView = new ProjectionView({
    runtimeConfig: runtime,
    onMappingModeChange: (on) =>
      pushLog(
        on
          ? 'Projection mapping ON — drag orange squares; M off · [ ] grid · R reset corners'
          : 'Projection mapping off (press M)'
      )
  });

  let debugMode = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      return;
    }
    if (e.key !== 'd' && e.key !== 'D') {
      return;
    }
    debugMode = !debugMode;
    if (debugMode) {
      pushLog('Debug on — D off · M projection map · [ ] grid · R corners · click/key sound');
    }
    console.log(`[book] Debug ${debugMode ? 'on' : 'off'}`);
  });

  const media = new MediaEngine(p, projectionView);

  /** Avoid restarting the same background clip when branching timeout targets the current scene. */
  let lastAppliedMediaKey = null;

  function applyScene(scene, source = 'local') {
    if (!scene) {
      return;
    }

    const mediaKey = `${scene.sceneId}|${scene.backgroundVideo ?? ''}`;
    if (
      mediaKey === lastAppliedMediaKey &&
      (source === 'video-ended' || source === 'timeoutExpired')
    ) {
      return;
    }
    lastAppliedMediaKey = mediaKey;

    publishSceneToSync(scene, source);

    const syncClip =
      runtime.playback?.syncTabletTimerToVideo !== false && Boolean(scene.backgroundVideo);

    media.applyScene(scene, runtime, {
      onClipDurationSeconds: (sec) => {
        if (!syncClip) {
          return;
        }
        if (scene.hideTabletTimer === true) {
          return;
        }
        if (!Number.isFinite(sec) || sec <= 0) {
          return;
        }
        publishSceneToSync(scene, source, sec);
      },
      onVideoEnded: () => {
        if (!scene.backgroundVideo) {
          return;
        }
        if (stateMachine.getCurrentScene()?.sceneId !== scene.sceneId) {
          return;
        }
        const next = stateMachine.advanceAfterClip();
        if (next) {
          applyScene(next, 'video-ended');
        }
      }
    });

    pushLog(`Scene changed to ${scene.sceneId} from ${source}`);
  }

  function publishSceneToSync(scene, source, clipDurationSeconds = null) {
    if (!scene) {
      return;
    }
    network.send('sceneChanged', {
      sceneId: scene.sceneId,
      source,
      clipDurationSeconds
    });
  }

  const network = new NetworkClient(getSyncServerUrl(runtime.network.serverUrl), {
    onOpen: () => {
      pushLog('Connected to sync server');
      // Startup applyScene runs before connect(); push state so tablet stays in sync.
      publishSceneToSync(stateMachine.getCurrentScene(), 'book-reconnect');
    },
    onClose: () => pushLog('Disconnected from sync server; reconnecting'),
    onEvent: (event) => {
      if (event.type === 'chooseOption') {
        const scene = stateMachine.chooseOption(event.payload.choiceId);
        applyScene(scene, 'tablet-choice');
      }

      if (event.type === 'debugSkipToPreReveal') {
        const expectedId = event.payload?.sceneId;
        const secondsLeft = event.payload?.secondsLeft;
        if (
          !expectedId ||
          typeof secondsLeft !== 'number' ||
          stateMachine.getCurrentScene()?.sceneId !== expectedId
        ) {
          return;
        }
        const sc = stateMachine.getCurrentScene();
        if (!sc?.backgroundVideo || !sc.choices?.length) {
          return;
        }
        if (projectionView.seekVideoToTimeLeft(secondsLeft, { allowRewind: false })) {
          pushLog(`Debug skip: video → ~${secondsLeft}s remaining`);
        } else {
          pushLog(`Debug skip: seek queued (metadata loading) → ~${secondsLeft}s`);
        }
        return;
      }

      if (event.type === 'timeoutExpired') {
        const expectedId = event.payload?.sceneId;
        if (expectedId && stateMachine.getCurrentScene()?.sceneId !== expectedId) {
          return;
        }
        const scene = stateMachine.timeout();
        if (scene) {
          applyScene(scene, 'timeoutExpired');
        }
        return;
      }

      if (event.type === 'resetStory') {
        lastAppliedMediaKey = null;
        const scene = stateMachine.reset();
        applyScene(scene, event.type);
      }

      // Book is scene master; sceneSync is for tablet reconnect only.

      if (event.type === 'diceRollResult') {
        pushLog(`Dice result received: ${event.payload.value}`);
      }
    },
    onError: (message) => pushLog(message)
  });

  function styleHudCanvas() {
    const elt = p.canvas;
    if (!elt) {
      return;
    }
    elt.style.position = 'fixed';
    elt.style.left = '0';
    elt.style.top = '0';
    elt.style.zIndex = '1';
    elt.style.pointerEvents = 'none';
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    styleHudCanvas();
    p.textFont('Georgia');
    p.textWrap(p.WORD);

    projectionView.setRuntimeConfig(runtime);
    projectionView.mount(document.body);

    applyScene(stateMachine.getCurrentScene(), 'startup');
    network.connect();
  };

  p.draw = () => {
    projectionView.render();
    p.clear();

    if (!debugMode) {
      return;
    }

    const scene = stateMachine.getCurrentScene();
    p.fill(0, 0, 0, 130);
    p.rect(48, p.height - 260, p.width - 96, 200, 12);

    p.fill(245);
    p.textSize(34);
    p.text(scene.displayText || 'No text for scene.', 80, p.height - 220, p.width - 160, 160);

    p.fill(170, 210, 255);
    p.textSize(20);
    p.text(`Scene: ${scene.sceneId}`, 80, p.height - 72);

    p.fill(0, 0, 0, 130);
    p.rect(48, 24, 560, 150, 8);
    p.fill(190, 232, 255);
    p.textSize(16);
    logLines.forEach((line, index) => {
      p.text(line, 64, 52 + index * 22);
    });
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    styleHudCanvas();
  };
});
