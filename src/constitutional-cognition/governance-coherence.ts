export function governanceCoherence(conflicts: number, decisions: number, evidenceIds: string[]) {
  if (decisions <= 0) throw new Error("governance_decision_count_invalid");
  if (evidenceIds.length === 0) throw new Error("governance_coherence_requires_evidence");
  const conflictRate = conflicts / decisions;
  return { status: conflictRate >= 0.25 ? "INCOHERENT" as const : "COHERENT" as const, coherenceScore: 1 - Math.min(1, conflictRate), evidenceIds: [...evidenceIds] };
}
