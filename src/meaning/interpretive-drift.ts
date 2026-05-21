export function interpretiveDrift(previousTerms: readonly string[], currentTerms: readonly string[], evidenceIds: string[]) {
  if (previousTerms.length === 0 || evidenceIds.length === 0) throw new Error("interpretive_drift_requires_evidence");
  const current = new Set(currentTerms);
  const missing = previousTerms.filter((term) => !current.has(term));
  return { status: missing.length > 0 ? "DRIFTING" as const : "STABLE" as const, driftScore: missing.length / previousTerms.length, missing, evidenceIds: [...evidenceIds] };
}
