import p5 from 'p5';
import story from '@shared/story/story.json' assert { type: 'json' };
import runtime from '@shared/config/runtime.json' assert { type: 'json' };
import { NetworkClient } from './networkClient.js';
import { CountdownTimer } from './countdown.js';
import { Dice3D } from './dice3d.js';

const sceneMap = new Map(story.scenes.map((scene) => [scene.sceneId, scene]));
let currentSceneId = story.startSceneId;
let interactionLocked = false;
const logLines = [];

function pushLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logLines.unshift(`${timestamp} - ${message}`);
  if (logLines.length > 8) {
    logLines.pop();
  }
  console.log(`[tablet] ${message}`);
}

const impactAudio = new Audio('assets/audio/dice-impact.mp3');

const network = new NetworkClient(runtime.network.serverUrl, {
  onOpen: () => pushLog('Connected to sync server'),
  onClose: () => pushLog('Disconnected from sync server; reconnecting'),
  onEvent: (event) => {
    if (event.type === 'sceneChanged' && event.payload?.sceneId) {
      currentSceneId = event.payload.sceneId;
      restartTimer();
      pushLog(`Scene synced from book: ${currentSceneId}`);
    }

    if (event.type === 'sceneSync' && event.payload?.sceneId) {
      currentSceneId = event.payload.sceneId;
      restartTimer();
      pushLog(`Scene snapshot received: ${currentSceneId}`);
    }
  }
});

const timer = new CountdownTimer(() => {
  network.send('timeoutExpired', { sceneId: currentSceneId });
  network.send('resetStory', { reason: 'timeout' });
  currentSceneId = story.startSceneId;
  restartTimer();
  pushLog('Timeout reached; story reset');
});

const dice = new Dice3D('dice-view', {
  onImpact: () => {
    impactAudio.currentTime = 0;
    impactAudio.play().catch(() => {});
  },
  onResult: (value) => {
    interactionLocked = false;
    network.send('diceRollResult', { value, sceneId: currentSceneId });
    pushLog(`Dice settled at ${value}`);
  }
});

function getCurrentScene() {
  return sceneMap.get(currentSceneId) ?? sceneMap.get(story.startSceneId);
}

function restartTimer() {
  const scene = getCurrentScene();
  timer.start(scene.timeoutSeconds || runtime.defaultTimeoutSeconds);
}

function choose(choiceId) {
  if (interactionLocked) {
    return;
  }

  const scene = getCurrentScene();
  const choice = scene.choices.find((entry) => entry.id === choiceId);
  if (!choice) {
    return;
  }

  currentSceneId = choice.targetSceneId;
  network.send('chooseOption', { choiceId, sceneId: scene.sceneId });
  restartTimer();
  pushLog(`Choice selected: ${choice.label}`);
}

new p5((p) => {
  let buttonAreas = [];

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('app');
    p.textFont('Arial');
    restartTimer();
    network.connect();
  };

  p.draw = () => {
    timer.update();
    const scene = getCurrentScene();

    p.background(6, 17, 31);
    p.fill(230);
    p.textSize(30);
    p.text('Arctic Survival Controller', 40, 56);

    p.fill(160, 210, 255);
    p.textSize(21);
    p.text(`Scene: ${scene.sceneId}`, 40, 96);

    p.fill(255);
    p.textSize(24);
    p.text(scene.displayText, 40, 140, p.width - 380, 150);

    const secondsLeft = timer.getSecondsLeft();
    p.fill(secondsLeft <= 5 ? '#ff6d6d' : '#8de0ff');
    p.textSize(46);
    p.text(`Time Left: ${secondsLeft}s`, 40, 330);

    buttonAreas = scene.choices.map((choice, idx) => {
      const x = 40;
      const y = 380 + idx * 92;
      const w = p.width - 380;
      const h = 68;

      p.fill(interactionLocked ? '#4a6482' : '#1e4e84');
      p.rect(x, y, w, h, 10);
      p.fill(245);
      p.textSize(24);
      p.text(choice.label, x + 20, y + 43);

      return { ...choice, x, y, w, h };
    });

    p.fill(interactionLocked ? '#5f7fa6' : '#6ab7ff');
    p.rect(p.width - 340, p.height - 94, 300, 54, 8);
    p.fill(20);
    p.textSize(25);
    p.text(interactionLocked ? 'Rolling...' : 'Throw D20', p.width - 252, p.height - 57);

    p.fill(0, 0, 0, 110);
    p.rect(32, p.height - 230, 620, 190, 8);
    p.fill(180, 224, 255);
    p.textSize(16);
    logLines.forEach((line, index) => {
      p.text(line, 48, p.height - 196 + index * 20);
    });
  };

  p.mousePressed = () => {
    for (const button of buttonAreas) {
      const withinX = p.mouseX >= button.x && p.mouseX <= button.x + button.w;
      const withinY = p.mouseY >= button.y && p.mouseY <= button.y + button.h;
      if (withinX && withinY) {
        choose(button.id);
        return;
      }
    }

    const throwX = p.mouseX >= p.width - 340 && p.mouseX <= p.width - 40;
    const throwY = p.mouseY >= p.height - 94 && p.mouseY <= p.height - 40;
    if (throwX && throwY && !interactionLocked) {
      interactionLocked = true;
      network.send('diceRollStart', { sceneId: currentSceneId });
      pushLog('Dice roll started');
      dice.throwDice();
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
});
