export function operationalFinality(arbitrated: boolean, confidence: number, evidenceIds: string[]) {
  if (confidence < 0 || confidence > 1 || evidenceIds.length === 0) throw new Error("operational_finality_requires_evidence");
  return { status: arbitrated && confidence >= 0.7 ? "FINAL" as const : "NOT_FINAL" as const, confidence, preserveDisputeHistory: true as const, evidenceIds: [...evidenceIds] };
}
