export function evidenceExplosion(evidenceCount: number, budget: number, evidenceIds: string[]) {
  if (evidenceCount < 0 || budget < 0 || evidenceIds.length === 0) throw new Error("evidence_explosion_requires_evidence");
  return { status: evidenceCount > budget ? "EVIDENCE_EXPLOSION" as const : "EVIDENCE_BOUNDED" as const, evidenceCount, budget, evidenceIds: [...evidenceIds] };
}
