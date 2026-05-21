export function governanceInvariant(legitimate: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_invariant_requires_evidence");
  return { invariant: "governance_legitimacy" as const, status: legitimate ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
