/**
 * Kérés-ütemező szolgáltatásonként: max. párhuzamosság és minimális időköz
 * (Nominatim: 1 kérés/s; Overpass: 1 párhuzamos kérés), 429/503 esetén visszalépéssel újrapróbál.
 */
import { HttpError } from '../native/http';

export class Limiter {
  private queue: (() => void)[] = [];
  private running = 0;
  private last = 0;

  constructor(
    private maxConcurrent: number,
    private minIntervalMs: number,
  ) {}

  async run<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    await this.acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        const wait = this.last + this.minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        this.last = Date.now();
        try {
          return await fn();
        } catch (err) {
          const retryable =
            err instanceof HttpError && (err.status === 429 || err.status === 503 || err.status === 504);
          if (!retryable || attempt >= retries) throw err;
          await sleep(2000 * 2 ** attempt);
        }
      }
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => (this.running++, resolve())));
  }

  private release(): void {
    this.running--;
    this.queue.shift()?.();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
