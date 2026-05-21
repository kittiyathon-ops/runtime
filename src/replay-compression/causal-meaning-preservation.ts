export function causalMeaningPreservation(originalEdges: readonly string[], compressedEdges: readonly string[], evidenceIds: string[]) {
  if (originalEdges.length === 0 || compressedEdges.length === 0 || evidenceIds.length === 0) throw new Error("causal_meaning_preservation_requires_evidence");
  const compressed = new Set(compressedEdges);
  const missingEdges = [...new Set(originalEdges)].filter((edge) => !compressed.has(edge)).sort();
  return { status: missingEdges.length === 0 ? "CAUSAL_MEANING_PRESERVED" as const : "CAUSAL_MEANING_LOST" as const, missingEdges, evidenceIds: [...evidenceIds] };
}
