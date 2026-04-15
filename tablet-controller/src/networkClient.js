export class NetworkClient {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.socket = null;
    this.reconnectDelayMs = 1500;
  }

  connect() {
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => this.handlers.onOpen?.());

    this.socket.addEventListener('message', (event) => {
      try {
        this.handlers.onEvent?.(JSON.parse(event.data));
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
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }
}
