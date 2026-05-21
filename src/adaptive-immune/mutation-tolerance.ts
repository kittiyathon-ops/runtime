export function mutationTolerance(mutationMagnitude: number, allowedEnvelope: number, doctrineMutation: boolean, evidenceIds: string[]) {
  if (mutationMagnitude < 0 || allowedEnvelope < 0 || evidenceIds.length === 0) throw new Error("mutation_tolerance_requires_evidence");
  const safe = mutationMagnitude <= allowedEnvelope && !doctrineMutation;
  return {
    status: safe ? "MUTATION_TOLERATED" as const : "MUTATION_QUARANTINED" as const,
    mutationMagnitude,
    allowedEnvelope,
    doctrineMutation,
    evidenceIds: [...evidenceIds]
  };
}
