export function confidenceCollapse(previousConfidence: number, currentConfidence: number, evidenceIds: string[]) {
  if (previousConfidence < 0 || currentConfidence < 0 || previousConfidence > 1 || currentConfidence > 1) throw new Error("confidence_invalid");
  if (evidenceIds.length === 0) throw new Error("confidence_collapse_requires_evidence");
  const collapse = Math.max(0, previousConfidence - currentConfidence);
  return { status: collapse >= 0.5 ? "COLLAPSED" as const : collapse > 0 ? "DEGRADED" as const : "STABLE" as const, collapse, evidenceIds: [...evidenceIds] };
}
