export const REPLAY_COMPRESSION_BOUNDARY = Object.freeze([
  "causal_ordering",
  "governance_decisions",
  "identity_lineage",
  "operational_truth_transitions",
  "explainability_critical_evidence"
] as const);

export function compressionBoundary(preservedBoundaries: readonly string[], evidenceIds: string[]) {
  if (preservedBoundaries.length === 0 || evidenceIds.length === 0) throw new Error("compression_boundary_requires_evidence");
  const preserved = new Set(preservedBoundaries);
  const missing = REPLAY_COMPRESSION_BOUNDARY.filter((boundary) => !preserved.has(boundary));
  return { status: missing.length === 0 ? "COMPRESSION_BOUNDARY_PRESERVED" as const : "COMPRESSION_BOUNDARY_BREACHED" as const, missing, evidenceIds: [...evidenceIds] };
}
