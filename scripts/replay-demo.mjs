import WebSocket from 'ws';

const url = process.env.SYNC_URL || 'ws://localhost:8787';
const client = new WebSocket(url);

const steps = [
  { delayMs: 500, type: 'chooseOption', payload: { choiceId: 'poa_start_reading', sceneId: 'scene_00_title' } },
  { delayMs: 1200, type: 'chooseOption', payload: { choiceId: 'poa_hammock', sceneId: 'scene_01_opening' } },
  { delayMs: 3500, type: 'chooseOption', payload: { choiceId: 'track1_peek', sceneId: 'scene_02_track1' } },
  { delayMs: 7000, type: 'timeoutExpired', payload: { sceneId: 'scene_03_t1_peek' } },
  { delayMs: 7800, type: 'resetStory', payload: { reason: 'demo-walkthrough' } }
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
  }, 9500);
});

client.on('error', (error) => {
  console.error('[demo] websocket error:', error.message);
});
