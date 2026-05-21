import type { Clock } from "../infra/clock.js";
import type { EdgeRecommendation, EdgeTrustLevel } from "./edge-types.js";

export interface EdgeTrustInput {
  sourceId: string;
  lastReceivedAt: number;
  freshnessThresholdMs: number;
  duplicateDeliveryRate: number;
  sequenceGapCount: number;
  reconnectCount: number;
  latencyDriftMs: number;
  sourceConsistency: number;
  replayDivergenceCount: number;
}

export interface EdgeTrustSnapshot {
  sourceId: string;
  score: number;
  level: EdgeTrustLevel;
  reason: string;
  recommendation: EdgeRecommendation;
}

export class EdgeTrustEvaluator {
  constructor(private readonly clock: Clock) {}

  evaluate(input: EdgeTrustInput): EdgeTrustSnapshot {
    const age = Math.max(0, this.clock.now() - input.lastReceivedAt);
    let score = 100;
    if (age > input.freshnessThresholdMs) score -= 30;
    score -= Math.min(30, input.duplicateDeliveryRate * 100);
    score -= Math.min(25, input.sequenceGapCount * 5);
    score -= Math.min(20, input.reconnectCount * 2);
    score -= Math.min(15, input.latencyDriftMs / 10);
    score -= Math.min(25, (1 - input.sourceConsistency) * 25);
    score -= Math.min(40, input.replayDivergenceCount * 10);
    score = Math.max(0, Number(score.toFixed(4)));

    const level: EdgeTrustLevel = score >= 80 ? "TRUSTED" : score >= 55 ? "SUSPECT" : score >= 30 ? "UNTRUSTED" : "QUARANTINED";
    const recommendation: EdgeRecommendation =
      level === "TRUSTED" ? "ACCEPT" : level === "SUSPECT" ? "THROTTLE" : level === "UNTRUSTED" ? "SAFE_MODE" : "QUARANTINE_SOURCE";

    return {
      sourceId: input.sourceId,
      score,
      level,
      reason: reasonFor(input, age),
      recommendation
    };
  }
}

function reasonFor(input: EdgeTrustInput, age: number): string {
  if (age > input.freshnessThresholdMs) return "feed_freshness_degraded";
  if (input.replayDivergenceCount > 0) return "replay_divergence_evidence";
  if (input.sequenceGapCount > 0) return "sequence_gap_evidence";
  if (input.duplicateDeliveryRate > 0) return "duplicate_delivery_evidence";
  if (input.reconnectCount > 0) return "reconnect_instability";
  if (input.sourceConsistency < 1) return "source_consistency_degraded";
  return "trusted";
}

