import WebSocket from 'ws';

const url = process.env.SYNC_URL || 'ws://localhost:8787';
const client = new WebSocket(url);

const steps = [
  { delayMs: 1000, type: 'chooseOption', payload: { choiceId: 'route_ridge', sceneId: 'intro' } },
  { delayMs: 2500, type: 'diceRollStart', payload: { sceneId: 'ridge' } },
  { delayMs: 4500, type: 'diceRollResult', payload: { sceneId: 'ridge', value: 14 } },
  { delayMs: 7000, type: 'chooseOption', payload: { choiceId: 'ridge_hide', sceneId: 'ridge' } },
  { delayMs: 9500, type: 'timeoutExpired', payload: { sceneId: 'valley' } },
  { delayMs: 10200, type: 'resetStory', payload: { reason: 'demo-walkthrough' } }
];

client.on('open', () => {
  console.log(`[demo] connected to ${url}`);

  for (const step of steps) {
    setTimeout(() => {
      client.send(JSON.stringify({ type: step.type, payload: step.payload }));
      console.log(`[demo] sent ${step.type}`);
    }, step.delayMs);
  }

  setTimeout(() => {
    console.log('[demo] complete');
    client.close();
  }, 12000);
});

client.on('error', (error) => {
  console.error('[demo] websocket error:', error.message);
});
