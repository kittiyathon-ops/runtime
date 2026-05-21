export function conceptualContinuity(requiredConcepts: readonly string[], activeConcepts: readonly string[], evidenceIds: string[]) {
  if (requiredConcepts.length === 0 || evidenceIds.length === 0) throw new Error("conceptual_continuity_requires_evidence");
  const active = new Set(activeConcepts);
  const missing = requiredConcepts.filter((concept) => !active.has(concept));
  return { status: missing.length === 0 ? "CONTINUOUS" as const : "FRAGMENTED" as const, missing, evidenceIds: [...evidenceIds] };
}
