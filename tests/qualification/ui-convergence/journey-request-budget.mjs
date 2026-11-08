import { setTimeout as delay } from 'node:timers/promises';

/** 100 immediate probes plus 300 refills/minute leave 200 of the native 600 for browser work. */
export class JourneyRequestBudget {
  constructor({ now = () => performance.now(), wait = delay, refillEveryMs = 200 } = {}) {
    this.now = now;
    this.wait = wait;
    this.refillEveryMs = refillEveryMs;
    this.updated = now();
    this.tokens = 100;
  }

  async reserve() {
    for (;;) {
      const now = this.now();
      this.tokens = Math.min(100, this.tokens + (now - this.updated) / this.refillEveryMs);
      this.updated = now;
      if (this.tokens >= 1) {
        this.tokens--;
        return;
      }
      await this.wait(Math.ceil((1 - this.tokens) * this.refillEveryMs));
    }
  }
}
