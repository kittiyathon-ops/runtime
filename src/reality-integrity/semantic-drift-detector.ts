export function semanticDriftDetector(expectedTerms: readonly string[], actualTerms: readonly string[], evidenceIds: string[]) {
  if (expectedTerms.length === 0 || evidenceIds.length === 0) throw new Error("semantic_drift_requires_terms_and_evidence");
  const actual = new Set(actualTerms);
  const missing = expectedTerms.filter((term) => !actual.has(term));
  return { status: missing.length > 0 ? "DRIFTING" as const : "STABLE" as const, missing, driftScore: missing.length / expectedTerms.length, evidenceIds: [...evidenceIds] };
}
