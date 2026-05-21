export function causalityInvariant(causesBeforeEffects: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("causality_invariant_requires_evidence");
  return { invariant: "causal_consistency" as const, status: causesBeforeEffects ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
