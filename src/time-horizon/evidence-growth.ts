export function evidenceGrowth(evidenceCount: number, evidenceBudget: number, evidenceIds: string[]) {
  if (evidenceCount < 0 || evidenceBudget < 0 || evidenceIds.length === 0) throw new Error("evidence_growth_requires_evidence");
  return { status: evidenceCount <= evidenceBudget ? "EVIDENCE_GROWTH_BOUNDED" as const : "EVIDENCE_GROWTH_UNBOUNDED" as const, evidenceCount, evidenceBudget, evidenceIds: [...evidenceIds] };
}
