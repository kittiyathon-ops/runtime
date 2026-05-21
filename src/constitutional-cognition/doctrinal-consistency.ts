export function doctrinalConsistency(expected: readonly string[], actual: readonly string[], evidenceIds: string[]) {
  if (expected.length === 0 || evidenceIds.length === 0) throw new Error("doctrinal_consistency_requires_evidence");
  const actualSet = new Set(actual);
  const missing = expected.filter((item) => !actualSet.has(item));
  return { status: missing.length === 0 ? "CONSISTENT" as const : "INCONSISTENT" as const, missing, evidenceIds: [...evidenceIds] };
}
