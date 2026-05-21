export function removalCandidate(moduleId: string, survivesWithoutModule: boolean, invariantImpact: readonly string[], evidenceIds: string[]) {
  if (moduleId.length === 0 || evidenceIds.length === 0) throw new Error("removal_candidate_requires_evidence");
  const safeForReview = survivesWithoutModule && invariantImpact.length === 0;
  return {
    moduleId,
    status: safeForReview ? "REMOVAL_CANDIDATE_RECOMMENDED_ONLY" as const : "REMOVAL_CANDIDATE_BLOCKED" as const,
    automaticDeletionAllowed: false,
    invariantImpact: [...invariantImpact].sort(),
    evidenceIds: [...evidenceIds]
  };
}
