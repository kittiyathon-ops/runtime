export function boundedMutation(limitPreserved: boolean, rollbackSafe: boolean, provenanceBound: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("bounded_mutation_requires_evidence");
  return { status: limitPreserved && rollbackSafe && provenanceBound ? "BOUNDED_MUTATION_VALID" as const : "BOUNDED_MUTATION_INVALID" as const, evidenceIds: [...evidenceIds] };
}
