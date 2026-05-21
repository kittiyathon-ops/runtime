export function collapseThreshold(survivabilityScore: number, minimumScore: number, evidenceIds: string[]) {
  if (survivabilityScore < 0 || survivabilityScore > 1 || minimumScore < 0 || minimumScore > 1 || evidenceIds.length === 0) throw new Error("collapse_threshold_requires_evidence");
  return {
    status: survivabilityScore >= minimumScore ? "COLLAPSE_THRESHOLD_CLEAR" as const : "SURVIVAL_ONLY_REQUIRED" as const,
    survivabilityScore,
    minimumScore,
    evidenceIds: [...evidenceIds]
  };
}
