export function timelineDivergence(expectedSeq: number, actualSeq: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("timeline_divergence_requires_evidence");
  const divergence = Math.abs(actualSeq - expectedSeq);
  return { status: divergence > 0 ? "DIVERGENT" as const : "ALIGNED" as const, divergence, evidenceIds: [...evidenceIds] };
}
