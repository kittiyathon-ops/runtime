import type { RecoveryTrigger, SafeRuntimeState } from "./safe-state-transitions.js";

export interface DegradationInput {
  trustScore: number;
  exchangePartitionMs: number;
  replayDivergent: boolean;
  operationalRealityDisputed: boolean;
  governanceAvailable: boolean;
}

export interface DegradationDecision {
  targetState: SafeRuntimeState;
  trigger: RecoveryTrigger;
  reason: string;
  preserveTimelineContinuity: boolean;
  preserveExplainability: boolean;
}

export class GracefulDegradationPolicy {
  decide(input: DegradationInput): DegradationDecision {
    if (input.trustScore < 0 || input.trustScore > 1) throw new Error("trust_score_invalid");
    if (input.exchangePartitionMs < 0) throw new Error("exchange_partition_invalid");
    if (!input.governanceAvailable) {
      return this.decision("HALTED", "governance_crash", "governance_unavailable");
    }
    if (input.replayDivergent) {
      return this.decision("HALTED", "replay_divergence", "replay_divergence_detected");
    }
    if (input.operationalRealityDisputed) {
      return this.decision("SAFE_MODE", "operational_reality_disputed", "operational_reality_disputed");
    }
    if (input.exchangePartitionMs >= 300_000) {
      return this.decision("SAFE_MODE", "exchange_partition", "exchange_partition_5m");
    }
    if (input.trustScore < 0.5) {
      return this.decision("SAFE_MODE", "trust_collapse", "trust_score_below_0_5");
    }
    if (input.trustScore < 0.75 || input.exchangePartitionMs > 0) {
      return this.decision("DEGRADED", input.exchangePartitionMs > 0 ? "exchange_partition" : "trust_collapse", "degrade_before_hard_stop");
    }
    return this.decision("NORMAL", "manual_release", "no_degradation_required");
  }

  private decision(targetState: SafeRuntimeState, trigger: RecoveryTrigger, reason: string): DegradationDecision {
    return {
      targetState,
      trigger,
      reason,
      preserveTimelineContinuity: true,
      preserveExplainability: true
    };
  }
}
