export class CountdownTimer {
  constructor(onExpire) {
    this.onExpire = onExpire;
    this.remainingMs = 0;
    this.deadline = 0;
    this.totalDurationMs = 1;
    this.running = false;
  }

  start(seconds) {
    const ms = Math.max(0, seconds * 1000);
    this.totalDurationMs = Math.max(1, ms);
    this.remainingMs = ms;
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

  /** 1 = full time left, 0 = elapsed */
  getTimeFractionRemaining() {
    if (!this.totalDurationMs) {
      return 0;
    }
    return Math.min(1, Math.max(0, this.remainingMs / this.totalDurationMs));
  }

  /** Jump countdown without firing onExpire (debug / sync). */
  setSecondsRemaining(seconds) {
    const s = Math.max(0, seconds);
    this.totalDurationMs = Math.max(1, s * 1000);
    this.remainingMs = this.totalDurationMs;
    this.deadline = performance.now() + this.remainingMs;
    this.running = true;
  }

  /** Stop without calling onExpire (title / idle scenes). */
  stopQuietly() {
    this.running = false;
    this.remainingMs = 0;
    this.totalDurationMs = 1;
  }
}
