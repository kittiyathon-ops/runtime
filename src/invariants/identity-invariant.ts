export function identityInvariant(continuityHashStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("identity_invariant_requires_evidence");
  return { invariant: "identity_continuity" as const, status: continuityHashStable ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
