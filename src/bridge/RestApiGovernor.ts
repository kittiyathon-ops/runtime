import { RetryPolicy, type RetryOperationKind, type RetryDecision } from "../infra/retry-policy.js";

export type RestApiGovernanceAction = "ALLOW" | "RETRY_SCHEDULED" | "REJECT" | "HIBERNATE" | "FATAL_SHUTDOWN";

export interface RestApiGovernanceDecision {
  readonly action: RestApiGovernanceAction;
  readonly reason: string;
  readonly retry?: RetryDecision;
  readonly evidenceIds: readonly string[];
}

export class RestApiGovernor {
  private instabilityCount = 0;

  constructor(
    private readonly retryPolicy: RetryPolicy,
    private readonly hibernationFailureThreshold: number
  ) {
    if (!Number.isInteger(hibernationFailureThreshold) || hibernationFailureThreshold <= 0) throw new Error("hibernation_threshold_invalid");
  }

  observeFailure(input: {
    readonly status?: number;
    readonly code?: number;
    readonly nowMs: number;
    readonly operation: RetryOperationKind;
    readonly attempt: number;
    readonly retryable: boolean;
    readonly hasIdempotencyKey?: boolean;
    readonly evidenceIds: readonly string[];
  }): RestApiGovernanceDecision {
    if (input.evidenceIds.length === 0) throw new Error("rest_api_governance_requires_evidence");
    if (input.status === 401 || input.status === 403 || input.code === -2015) {
      return { action: "FATAL_SHUTDOWN", reason: "fatal_exchange_auth_state", evidenceIds: [...input.evidenceIds] };
    }
    this.instabilityCount += 1;
    this.retryPolicy.recordFailure(input.nowMs);
    if (this.instabilityCount >= this.hibernationFailureThreshold) {
      return { action: "HIBERNATE", reason: "rest_api_instability_threshold_exceeded", evidenceIds: [...input.evidenceIds] };
    }
    const retry = this.retryPolicy.decide(input);
    return {
      action: retry.retry ? "RETRY_SCHEDULED" : "REJECT",
      reason: retry.reason,
      retry,
      evidenceIds: [...input.evidenceIds]
    };
  }

  observeSuccess(): void {
    this.instabilityCount = 0;
    this.retryPolicy.recordSuccess();
  }
}
