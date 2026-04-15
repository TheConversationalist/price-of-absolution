export class NetworkClient {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.socket = null;
    this.reconnectDelayMs = 1500;
  }

  connect() {
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.handlers.onOpen?.();
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        this.handlers.onEvent?.(parsed);
      } catch {
        this.handlers.onError?.('Invalid JSON payload received');
      }
    });

    this.socket.addEventListener('close', () => {
      this.handlers.onClose?.();
      window.setTimeout(() => this.connect(), this.reconnectDelayMs);
    });

    this.socket.addEventListener('error', () => {
      this.handlers.onError?.('Network socket error');
      this.socket.close();
    });
  }

  send(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type, payload }));
  }
}
