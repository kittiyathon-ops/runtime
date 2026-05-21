export type RequestGovernanceAction = "ALLOW" | "QUEUE" | "REJECT";

export interface RequestGovernorDecision {
  readonly action: RequestGovernanceAction;
  readonly reason: string;
  readonly tokensAvailable: number;
  readonly queueDepth: number;
  readonly retryAfterMs?: number;
  readonly evidenceIds: readonly string[];
}

export interface RequestGovernorOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
  readonly maxQueueDepth: number;
}

export interface GovernedRequest {
  readonly requestId: string;
  readonly weight: number;
  readonly createdAt: number;
  readonly evidenceIds: readonly string[];
}

export class RequestGovernor {
  private tokens: number;
  private lastRefillAt: number | undefined;
  private readonly queue: GovernedRequest[] = [];

  constructor(private readonly options: RequestGovernorOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity <= 0) throw new Error("request_governor_capacity_invalid");
    if (!Number.isInteger(options.refillPerSecond) || options.refillPerSecond <= 0) throw new Error("request_governor_refill_invalid");
    if (!Number.isInteger(options.maxQueueDepth) || options.maxQueueDepth < 0) throw new Error("request_governor_queue_invalid");
    this.tokens = options.capacity;
  }

  tryAcquire(requestId: string, weight: number, nowMs: number, evidenceIds: readonly string[]): RequestGovernorDecision {
    this.assertRequest(requestId, weight, nowMs, evidenceIds);
    this.refill(nowMs);
    if (weight > this.options.capacity) {
      return this.decision("REJECT", "request_weight_exceeds_capacity", weight, evidenceIds);
    }
    if (this.tokens >= weight && this.queue.length === 0) {
      this.tokens -= weight;
      return this.decision("ALLOW", "request_token_acquired", weight, evidenceIds);
    }
    if (this.queue.length >= this.options.maxQueueDepth) {
      return this.decision("REJECT", "request_queue_full", weight, evidenceIds);
    }
    this.queue.push({ requestId, weight, createdAt: nowMs, evidenceIds: [...evidenceIds] });
    return this.decision("QUEUE", "request_backpressure_queued", weight, evidenceIds);
  }

  drain(nowMs: number): GovernedRequest[] {
    if (!Number.isInteger(nowMs) || nowMs < 0) throw new Error("request_governor_time_invalid");
    this.refill(nowMs);
    const released: GovernedRequest[] = [];
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      if (next.weight > this.tokens) break;
      this.tokens -= next.weight;
      released.push(next);
      this.queue.shift();
    }
    return released;
  }

  observeRateLimit(nowMs: number, retryAfterMs: number, evidenceIds: readonly string[]): RequestGovernorDecision {
    if (!Number.isInteger(nowMs) || nowMs < 0) throw new Error("request_governor_time_invalid");
    if (!Number.isInteger(retryAfterMs) || retryAfterMs < 0) throw new Error("retry_after_invalid");
    if (evidenceIds.length === 0) throw new Error("request_governor_requires_evidence");
    this.tokens = 0;
    this.lastRefillAt = nowMs + retryAfterMs;
    return {
      action: "REJECT",
      reason: "exchange_rate_limit_observed",
      tokensAvailable: this.tokens,
      queueDepth: this.queue.length,
      retryAfterMs,
      evidenceIds: [...evidenceIds]
    };
  }

  snapshot(): { tokensAvailable: number; queueDepth: number; capacity: number; maxQueueDepth: number } {
    return {
      tokensAvailable: this.tokens,
      queueDepth: this.queue.length,
      capacity: this.options.capacity,
      maxQueueDepth: this.options.maxQueueDepth
    };
  }

  private refill(nowMs: number): void {
    if (this.lastRefillAt === undefined) {
      this.lastRefillAt = nowMs;
      return;
    }
    if (nowMs < this.lastRefillAt) return;
    const elapsedMs = nowMs - this.lastRefillAt;
    const refillTokens = Math.floor((elapsedMs * this.options.refillPerSecond) / 1_000);
    if (refillTokens <= 0) return;
    this.tokens = Math.min(this.options.capacity, this.tokens + refillTokens);
    this.lastRefillAt = nowMs;
  }

  private assertRequest(requestId: string, weight: number, nowMs: number, evidenceIds: readonly string[]): void {
    if (requestId.length === 0) throw new Error("request_id_required");
    if (!Number.isInteger(weight) || weight <= 0) throw new Error("request_weight_invalid");
    if (!Number.isInteger(nowMs) || nowMs < 0) throw new Error("request_governor_time_invalid");
    if (evidenceIds.length === 0) throw new Error("request_governor_requires_evidence");
  }

  private decision(action: RequestGovernanceAction, reason: string, weight: number, evidenceIds: readonly string[]): RequestGovernorDecision {
    const missingTokens = Math.max(0, weight - this.tokens);
    return {
      action,
      reason,
      tokensAvailable: this.tokens,
      queueDepth: this.queue.length,
      ...(missingTokens === 0 ? {} : { retryAfterMs: Math.ceil((missingTokens / this.options.refillPerSecond) * 1_000) }),
      evidenceIds: [...evidenceIds]
    };
  }
}
