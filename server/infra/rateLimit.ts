export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per-key spacing between request starts. Requests for the same key run one
 * at a time, at least `intervalMs` apart; different keys are independent.
 */
export class RateLimiter {
  private readonly intervals: Record<string, number>;
  private readonly tails = new Map<string, Promise<void>>();
  private readonly lastStart = new Map<string, number>();
  private readonly sleep: Sleep;
  private readonly now: () => number;

  constructor(intervals: Record<string, number>, sleep: Sleep = realSleep, now: () => number = Date.now) {
    this.intervals = intervals;
    this.sleep = sleep;
    this.now = now;
  }

  interval(key: string): number {
    return this.intervals[key] ?? 0;
  }

  async schedule<T>(key: string, task: () => Promise<T>): Promise<T> {
    const interval = this.interval(key);
    if (interval <= 0) return task();

    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    this.tails.set(key, previous.then(() => current));

    await previous;
    try {
      const wait = (this.lastStart.get(key) ?? -Infinity) + interval - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart.set(key, this.now());
      return await task();
    } finally {
      release();
    }
  }
}

/**
 * Minimum spacing between requests, per source, in ms. Values follow each
 * provider's published guidance (see .claude/skills/add-paper-source).
 */
export function defaultIntervals(keys: { semanticScholar?: boolean; ncbi?: boolean }): Record<string, number> {
  return {
    openalex: 120,
    'openalex-semantic': 1100,
    crossref: 100,
    arxiv: 3100,
    semanticscholar: keys.semanticScholar ? 1050 : 1500,
    pubmed: keys.ncbi ? 110 : 350,
    ieee: 220,
    dblp: 1000,
  };
}
