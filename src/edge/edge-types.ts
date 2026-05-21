import type { AlertCorrelation } from "../notifications/telegram-message-types.js";

export type EdgeSourceId = string;

export type EdgeHealthLevel = "HEALTHY" | "DEGRADED" | "UNTRUSTED" | "PARTITIONED" | "OFFLINE";
export type EdgeTrustLevel = "TRUSTED" | "SUSPECT" | "UNTRUSTED" | "QUARANTINED";
export type EdgeRecommendation =
  | "ACCEPT"
  | "THROTTLE"
  | "PASSIVE_ONLY"
  | "SAFE_MODE"
  | "HALT_INPUT"
  | "QUARANTINE_SOURCE";

export type EdgeSeverity = "INFO" | "WARNING" | "CRITICAL" | "FATAL";

export interface EdgeEvidence {
  sourceId?: EdgeSourceId;
  symbol?: string;
  seq?: number;
  expectedSeq?: number;
  receivedSeq?: number;
  eventId?: string;
  observedLatencyMs?: number;
  thresholdMs?: number;
  count?: number;
  windowMs?: number;
  reason?: string;
}

export interface EdgeCorrelation {
  traceId?: string;
  eventId?: string;
  sessionId?: string;
}

export interface EdgeReportBase {
  timestamp: number;
  severity: EdgeSeverity;
  recommendation: EdgeRecommendation;
  evidence: EdgeEvidence[];
  correlation?: AlertCorrelation | EdgeCorrelation;
}

export function maxRecommendation(recommendations: readonly EdgeRecommendation[]): EdgeRecommendation {
  return recommendations.reduce((current, next) => rank(next) > rank(current) ? next : current, "ACCEPT");
}

function rank(recommendation: EdgeRecommendation): number {
  return {
    ACCEPT: 0,
    THROTTLE: 1,
    PASSIVE_ONLY: 2,
    SAFE_MODE: 3,
    QUARANTINE_SOURCE: 4,
    HALT_INPUT: 5
  }[recommendation];
}

