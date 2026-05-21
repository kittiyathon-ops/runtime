export function causalCompression(causalEdges: readonly string[], evidenceIds: string[]) {
  if (causalEdges.length === 0 || evidenceIds.length === 0) throw new Error("causal_compression_requires_evidence");
  return { status: "CAUSALITY_PRESERVED" as const, edgeCount: new Set(causalEdges).size, evidenceIds: [...evidenceIds] };
}
