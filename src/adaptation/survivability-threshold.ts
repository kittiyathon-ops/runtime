export function survivabilityThreshold(score: number, threshold: number, evidenceIds: string[]) {
  if (score < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("survivability_threshold_requires_evidence");
  return { status: score >= threshold ? "PROMOTION_ALLOWED" as const : "PROMOTION_BLOCKED" as const, score, threshold, evidenceIds: [...evidenceIds] };
}
