export function conflictWeighting(contradictions: number, provenanceConflicts: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("conflict_weighting_requires_evidence");
  const weight = Math.min(1, (contradictions + provenanceConflicts * 2) / 10);
  return { weight, evidenceIds: [...evidenceIds] };
}
