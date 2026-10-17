import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements Cache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries = 500, now: () => number = Date.now) {
    this.maxEntries = maxEntries;
    this.now = now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency for LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** JSON files under `dir`, named by the SHA-1 of the key. Survives restarts. */
export class DiskCache implements Cache {
  private readonly dir: string;
  private readonly now: () => number;
  private ready: Promise<unknown> | null = null;

  constructor(dir: string, now: () => number = Date.now) {
    this.dir = dir;
    this.now = now;
  }

  private path(key: string): string {
    return join(this.dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const entry = JSON.parse(await readFile(this.path(key), 'utf8')) as Entry & { key: string };
      if (entry.key !== key) return undefined;
      if (entry.expiresAt <= this.now()) {
        await rm(this.path(key), { force: true });
        return undefined;
      }
      return entry.value as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.ready ??= mkdir(this.dir, { recursive: true });
    await this.ready;
    const entry = { key, value, expiresAt: this.now() + ttlMs };
    try {
      await writeFile(this.path(key), JSON.stringify(entry));
    } catch (err) {
      console.warn(`[cache] write failed: ${(err as Error).message}`);
    }
  }
}

/** Memory in front of disk; disk hits are promoted to memory. */
export class TieredCache implements Cache {
  private readonly memory: Cache;
  private readonly disk: Cache;

  constructor(memory: Cache, disk: Cache) {
    this.memory = memory;
    this.disk = disk;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = await this.memory.get<T>(key);
    if (hit !== undefined) return hit;
    const fromDisk = await this.disk.get<T>(key);
    if (fromDisk !== undefined) await this.memory.set(key, fromDisk, 60 * 60 * 1000);
    return fromDisk;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await Promise.all([this.memory.set(key, value, ttlMs), this.disk.set(key, value, ttlMs)]);
  }
}

/** For tests and for disabling caching. */
export class NoCache implements Cache {
  async get<T>(): Promise<T | undefined> {
    return undefined;
  }

  async set(): Promise<void> {}
}
