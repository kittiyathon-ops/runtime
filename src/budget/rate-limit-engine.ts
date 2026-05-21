export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  windowStart: number;
  used: number;
}

export class RateLimitEngine {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
      throw new Error("rate_limit_invalid");
    }
  }

  consume(key: string, timestamp: number, cost = 1): RateLimitDecision {
    if (key.length === 0) throw new Error("rate_limit_key_required");
    if (!Number.isInteger(cost) || cost <= 0) throw new Error("rate_limit_cost_invalid");
    const existing = this.buckets.get(key);
    const bucket = existing === undefined || timestamp >= existing.windowStart + this.windowMs
      ? { windowStart: timestamp, used: 0 }
      : existing;
    if (bucket.used + cost > this.limit) {
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: Math.max(0, this.limit - bucket.used), resetAt: bucket.windowStart + this.windowMs };
    }
    bucket.used += cost;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: this.limit - bucket.used, resetAt: bucket.windowStart + this.windowMs };
  }
}
