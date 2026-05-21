export function removalJustification(conceptId: string, justification: string, reversible: boolean, survivabilityPreserved: boolean, evidenceIds: string[]) {
  if (conceptId.length === 0 || justification.length === 0 || evidenceIds.length === 0) throw new Error("removal_justification_requires_evidence");
  const justified = reversible && survivabilityPreserved;
  return { conceptId, status: justified ? "REMOVAL_JUSTIFIED" as const : "REMOVAL_BLOCKED" as const, justification, reversible, survivabilityPreserved, evidenceIds: [...evidenceIds] };
}
