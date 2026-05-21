export function semanticInstability(drift: number, threshold: number, evidenceIds: string[]) {
  if (drift < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("semantic_instability_requires_evidence");
  return { status: drift > threshold ? "SEMANTIC_UNSTABLE" as const : "SEMANTIC_STABLE" as const, drift, threshold, evidenceIds: [...evidenceIds] };
}
