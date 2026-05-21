import type { Clock } from "./clock.js";

interface CacheEntry {
  expiresAt: number;
}

export interface IdempotencyCacheOptions {
  maxSize: number;
  ttlMs: number;
  clock: Clock;
}

export class IdempotencyCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly options: IdempotencyCacheOptions) {
    if (!Number.isInteger(options.maxSize) || options.maxSize <= 0) {
      throw new Error("idempotency_cache_max_size_invalid");
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 0) {
      throw new Error("idempotency_cache_ttl_invalid");
    }
  }

  has(key: string): boolean {
    this.assertKey(key);
    this.cleanup();
    return this.entries.has(key);
  }

  add(key: string): void {
    this.assertKey(key);
    this.cleanup();
    if (!this.entries.has(key) && this.entries.size >= this.options.maxSize) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { expiresAt: this.options.clock.now() + this.options.ttlMs });
  }

  checkAndAdd(key: string): boolean {
    if (this.has(key)) return false;
    this.add(key);
    return true;
  }

  cleanup(): void {
    const now = this.options.clock.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  size(): number {
    this.cleanup();
    return this.entries.size;
  }

  private assertKey(key: string): void {
    if (key.length === 0) throw new Error("idempotency_key_required");
  }
}
