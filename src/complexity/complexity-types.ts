export type ComplexityStatus = "WITHIN_BUDGET" | "DEGRADED" | "COLLAPSE_RISK";

export interface ComplexityDecision {
  status: ComplexityStatus;
  score: number;
  reason: string;
  evidenceIds: string[];
}

export function complexityDecision(score: number, reason: string, evidenceIds: string[]): ComplexityDecision {
  if (!Number.isFinite(score) || score < 0) throw new Error("complexity_score_invalid");
  if (evidenceIds.length === 0) throw new Error("complexity_requires_evidence");
  const bounded = Math.min(1, score);
  return {
    status: bounded >= 0.9 ? "COLLAPSE_RISK" : bounded >= 0.7 ? "DEGRADED" : "WITHIN_BUDGET",
    score: bounded,
    reason,
    evidenceIds: [...evidenceIds]
  };
}
