export function semanticDrift(domain: string, previousTerms: readonly string[], currentTerms: readonly string[], driftThreshold: number, evidenceIds: string[]) {
  if (domain.length === 0 || previousTerms.length === 0 || driftThreshold < 0 || driftThreshold > 1 || evidenceIds.length === 0) throw new Error("semantic_drift_requires_evidence");
  const current = new Set(currentTerms);
  const missingTerms = previousTerms.filter((term) => !current.has(term)).sort();
  const addedTerms = currentTerms.filter((term) => !previousTerms.includes(term)).sort();
  const driftScore = missingTerms.length / previousTerms.length;
  return {
    status: driftScore >= driftThreshold ? "SEMANTIC_DRIFT_DETECTED" as const : "SEMANTIC_STABLE" as const,
    domain,
    driftScore,
    missingTerms,
    addedTerms,
    recommendationOnly: true,
    evidenceIds: [...evidenceIds]
  };
}
