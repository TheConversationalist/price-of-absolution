import p5 from 'p5';
import story from '@shared/story/story.json' assert { type: 'json' };
import runtime from '@shared/config/runtime.json' assert { type: 'json' };
import { StoryStateMachine } from './stateMachine.js';
import { MediaEngine } from './mediaEngine.js';
import { NetworkClient } from './networkClient.js';

const stateMachine = new StoryStateMachine(story);

new p5((p) => {
  const media = new MediaEngine(p);
  const logLines = [];

  function pushLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logLines.unshift(`${timestamp} - ${message}`);
    if (logLines.length > 6) {
      logLines.pop();
    }
    console.log(`[book] ${message}`);
  }

  function applyScene(scene, source = 'local') {
    if (!scene) {
      return;
    }

    media.applyScene(scene, runtime);
    network.send('sceneChanged', {
      sceneId: scene.sceneId,
      source
    });
    pushLog(`Scene changed to ${scene.sceneId} from ${source}`);
  }

  const network = new NetworkClient(runtime.network.serverUrl, {
    onOpen: () => pushLog('Connected to sync server'),
    onClose: () => pushLog('Disconnected from sync server; reconnecting'),
    onEvent: (event) => {
      if (event.type === 'chooseOption') {
        const scene = stateMachine.chooseOption(event.payload.choiceId);
        applyScene(scene, 'tablet-choice');
      }

      if (event.type === 'timeoutExpired' || event.type === 'resetStory') {
        const scene = stateMachine.reset();
        applyScene(scene, event.type);
      }

      if (event.type === 'sceneSync' && event.payload?.sceneId) {
        if (stateMachine.transitionToScene(event.payload.sceneId)) {
          applyScene(stateMachine.getCurrentScene(), 'server-sync');
        }
      }

      if (event.type === 'diceRollResult') {
        pushLog(`Dice result received: ${event.payload.value}`);
      }
    },
    onError: (message) => pushLog(message)
  });

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.textFont('Georgia');
    p.textWrap(p.WORD);
    applyScene(stateMachine.getCurrentScene(), 'startup');
    network.connect();
  };

  p.draw = () => {
    media.drawBackground();

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
  };
});
