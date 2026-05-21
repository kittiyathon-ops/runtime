export function conceptMerge(sourceConceptIds: readonly string[], retainedConceptId: string, replayPreserved: boolean, explainabilityPreserved: boolean, constitutionalContinuityPreserved: boolean, evidenceIds: string[]) {
  if (sourceConceptIds.length === 0 || retainedConceptId.length === 0 || evidenceIds.length === 0) throw new Error("concept_merge_requires_evidence");
  const allowed = replayPreserved && explainabilityPreserved && constitutionalContinuityPreserved;
  return {
    status: allowed ? "MERGE_RECOMMENDED" as const : "MERGE_BLOCKED" as const,
    retainedConceptId,
    sourceConceptIds: [...sourceConceptIds].sort(),
    replayPreserved,
    explainabilityPreserved,
    constitutionalContinuityPreserved,
    evidenceIds: [...evidenceIds]
  };
}
