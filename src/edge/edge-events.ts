import type { EdgeCorrelation, EdgeEvidence, EdgeRecommendation, EdgeSeverity, EdgeSourceId } from "./edge-types.js";

export type EdgeEventType =
  | "EDGE_HEALTH_CHANGED"
  | "EDGE_LATENCY_SPIKE"
  | "EDGE_TRUST_DEGRADED"
  | "EDGE_PARTITION_DETECTED"
  | "EDGE_RECONNECT_GAP"
  | "EDGE_DUPLICATE_DELIVERY"
  | "EDGE_SEQUENCE_GAP"
  | "EDGE_FEED_STALE"
  | "EDGE_FEED_RECOVERED"
  | "EDGE_CONSENSUS_DIVERGENCE";

export interface EdgeEvent {
  type: EdgeEventType;
  timestamp: number;
  sourceId?: EdgeSourceId;
  severity: EdgeSeverity;
  recommendation: EdgeRecommendation;
  correlation?: EdgeCorrelation;
  evidence: EdgeEvidence[];
  quarantined?: boolean;
}

export function edgeEvent(input: EdgeEvent): EdgeEvent {
  JSON.stringify(input);
  return input;
}

