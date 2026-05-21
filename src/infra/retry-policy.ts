export type RetryOperationKind = "persistence" | "network_reconnect" | "order_submission" | "generic";
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type BackoffKind = "fixed" | "exponential";

export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoff: BackoffKind;
  retryBudget?: number;
  jitterRatio?: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerResetAfterMs: number;
}

export interface RetryContext {
  attempt: number;
  operation: RetryOperationKind;
  retryable: boolean;
  hasIdempotencyKey?: boolean;
  nowMs: number;
}

export interface RetryDecision {
  retry: boolean;
  delayMs: number;
  reason: string;
  circuitState: CircuitBreakerState;
}

export class RetryPolicy {
  private state: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private budgetUsed = 0;

  constructor(private readonly config: RetryPolicyConfig) {
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts <= 0) throw new Error("retry_max_attempts_invalid");
    if (!Number.isFinite(config.baseDelayMs) || config.baseDelayMs < 0) throw new Error("retry_base_delay_invalid");
    if (!Number.isFinite(config.maxDelayMs) || config.maxDelayMs < config.baseDelayMs) throw new Error("retry_max_delay_invalid");
    if (!Number.isInteger(config.circuitBreakerFailureThreshold) || config.circuitBreakerFailureThreshold <= 0) {
      throw new Error("circuit_breaker_threshold_invalid");
    }
    if (!Number.isFinite(config.circuitBreakerResetAfterMs) || config.circuitBreakerResetAfterMs < 0) {
      throw new Error("circuit_breaker_reset_invalid");
    }
  }

  decide(context: RetryContext): RetryDecision {
    this.refreshCircuit(context.nowMs);
    if (this.state === "OPEN") {
      return { retry: false, delayMs: 0, reason: "circuit_open", circuitState: this.state };
    }
    if (!context.retryable) {
      return { retry: false, delayMs: 0, reason: "failure_not_retryable", circuitState: this.state };
    }
    if (context.operation === "order_submission" && context.hasIdempotencyKey !== true) {
      return { retry: false, delayMs: 0, reason: "unsafe_order_retry_without_idempotency_key", circuitState: this.state };
    }
    if (context.attempt >= this.config.maxAttempts) {
      return { retry: false, delayMs: 0, reason: "max_attempts_exceeded", circuitState: this.state };
    }
    if (this.config.retryBudget !== undefined && this.budgetUsed >= this.config.retryBudget) {
      return { retry: false, delayMs: 0, reason: "retry_budget_exhausted", circuitState: this.state };
    }
    this.budgetUsed += 1;
    return {
      retry: true,
      delayMs: this.nextDelayMs(context.attempt),
      reason: "retry_allowed",
      circuitState: this.state
    };
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
    this.openedAt = 0;
  }

  recordFailure(nowMs: number): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.config.circuitBreakerFailureThreshold) {
      this.state = "OPEN";
      this.openedAt = nowMs;
    }
  }

  circuitState(nowMs: number): CircuitBreakerState {
    this.refreshCircuit(nowMs);
    return this.state;
  }

  nextDelayMs(attempt: number): number {
    if (!Number.isInteger(attempt) || attempt < 0) throw new Error("retry_attempt_invalid");
    const raw = this.config.backoff === "fixed"
      ? this.config.baseDelayMs
      : this.config.baseDelayMs * (2 ** attempt);
    const bounded = Math.min(this.config.maxDelayMs, raw);
    const jitterRatio = this.config.jitterRatio ?? 0;
    if (jitterRatio <= 0) return bounded;
    if (jitterRatio > 1) throw new Error("retry_jitter_invalid");
    const deterministicJitter = bounded * jitterRatio * ((attempt % 2 === 0) ? 0.5 : -0.5);
    return Math.max(0, Math.round(bounded + deterministicJitter));
  }

  private refreshCircuit(nowMs: number): void {
    if (this.state !== "OPEN") return;
    if (nowMs - this.openedAt >= this.config.circuitBreakerResetAfterMs) {
      this.state = "HALF_OPEN";
    }
  }
}
