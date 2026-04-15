export class CountdownTimer {
  constructor(onExpire) {
    this.onExpire = onExpire;
    this.remainingMs = 0;
    this.deadline = 0;
    this.running = false;
  }

  start(seconds) {
    this.remainingMs = seconds * 1000;
    this.deadline = performance.now() + this.remainingMs;
    this.running = true;
  }

  update() {
    if (!this.running) {
      return;
    }

    this.remainingMs = Math.max(this.deadline - performance.now(), 0);
    if (this.remainingMs === 0) {
      this.running = false;
      this.onExpire?.();
    }
  }

  getSecondsLeft() {
    return Math.ceil(this.remainingMs / 1000);
  }
}
