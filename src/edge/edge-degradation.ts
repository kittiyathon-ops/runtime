import type { EdgeConsensusResult } from "./edge-consensus.js";
import type { EdgeHealthSnapshot } from "./edge-health.js";
import type { EdgeLatencySnapshot } from "./edge-latency.js";
import type { EdgePartitionReport } from "./edge-partitions.js";
import type { EdgeTrustSnapshot } from "./edge-trust.js";
import { maxRecommendation, type EdgeRecommendation, type EdgeSeverity } from "./edge-types.js";

export interface EdgeDegradationInput {
  health?: EdgeHealthSnapshot;
  trust?: EdgeTrustSnapshot;
  latency?: EdgeLatencySnapshot;
  consensus?: EdgeConsensusResult;
  partition?: EdgePartitionReport;
}

export interface EdgeDegradationRecommendation {
  recommendation: EdgeRecommendation;
  severity: EdgeSeverity;
  reasons: string[];
}

export class EdgeDegradationPolicy {
  evaluate(input: EdgeDegradationInput): EdgeDegradationRecommendation {
    const recommendations: EdgeRecommendation[] = [];
    const reasons: string[] = [];

    if (input.health !== undefined && input.health.recommendation !== "ACCEPT") {
      recommendations.push(input.health.recommendation);
      reasons.push(`health:${input.health.level}`);
    }
    if (input.trust !== undefined && input.trust.recommendation !== "ACCEPT") {
      recommendations.push(input.trust.recommendation);
      reasons.push(`trust:${input.trust.level}:${input.trust.reason}`);
    }
    if (input.latency !== undefined && input.latency.recommendation !== "ACCEPT") {
      recommendations.push(input.latency.recommendation);
      reasons.push(input.latency.stale ? "latency:stale_packet" : "latency:spike");
    }
    if (input.consensus !== undefined && input.consensus.recommendation !== "ACCEPT") {
      recommendations.push(input.consensus.recommendation);
      reasons.push("consensus:feed_divergence");
    }
    if (input.partition !== undefined && input.partition.recommendation !== "ACCEPT") {
      recommendations.push(input.partition.recommendation);
      reasons.push(`partition:${input.partition.type}`);
    }

    const recommendation = maxRecommendation(recommendations);
    return {
      recommendation,
      severity: recommendation === "ACCEPT" ? "INFO" : recommendation === "THROTTLE" || recommendation === "PASSIVE_ONLY" ? "WARNING" : "CRITICAL",
      reasons
    };
  }
}

