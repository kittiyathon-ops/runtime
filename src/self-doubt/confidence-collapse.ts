export function doubtConfidenceCollapse(confidence: number, threshold: number, evidenceIds: string[]) {
  if (confidence < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("doubt_confidence_collapse_requires_evidence");
  return { status: confidence < threshold ? "CONFIDENCE_COLLAPSED" as const : "CONFIDENCE_STABLE" as const, confidence, threshold, evidenceIds: [...evidenceIds] };
}
