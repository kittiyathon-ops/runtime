export function doctrineConflict(domain: string, protectedDoctrineTerms: readonly string[], proposedMeaningTerms: readonly string[], evidenceIds: string[]) {
  if (domain.length === 0 || protectedDoctrineTerms.length === 0 || proposedMeaningTerms.length === 0 || evidenceIds.length === 0) throw new Error("doctrine_conflict_requires_evidence");
  const proposed = new Set(proposedMeaningTerms);
  const missingProtectedTerms = protectedDoctrineTerms.filter((term) => !proposed.has(term)).sort();
  return {
    status: missingProtectedTerms.length === 0 ? "DOCTRINE_CONFLICT_CLEAR" as const : "DOCTRINE_CONFLICT_DETECTED" as const,
    domain,
    missingProtectedTerms,
    recommendationOnly: true,
    mutationPerformed: false,
    evidenceIds: [...evidenceIds]
  };
}
