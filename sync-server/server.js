import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

let latestSceneState = {
  sceneId: 'intro',
  updatedAt: Date.now()
};

function broadcast(payload, exclude = null) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'sceneSync',
      payload: latestSceneState
    })
  );

  socket.on('message', (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      const now = Date.now();

      if (event.type === 'sceneChanged') {
        latestSceneState = { ...event.payload, updatedAt: now };
      }

      console.log(`[sync] ${event.type}`);
      broadcast({ ...event, receivedAt: now }, socket);
    } catch (error) {
      console.error('[sync] invalid message', error.message);
    }
  });

  socket.on('close', () => {
    console.log('[sync] client disconnected');
  });
});

console.log(`[sync] WebSocket relay listening on ws://0.0.0.0:${PORT}`);
