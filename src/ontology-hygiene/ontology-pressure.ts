export function ontologyPressure(conceptCount: number, maxConceptCount: number, overlapFindings: number, maxOverlapFindings: number, driftScore: number, maxDriftScore: number, evidenceIds: string[]) {
  if (conceptCount < 0 || maxConceptCount < 0 || overlapFindings < 0 || maxOverlapFindings < 0 || driftScore < 0 || driftScore > 1 || maxDriftScore < 0 || maxDriftScore > 1 || evidenceIds.length === 0) throw new Error("ontology_pressure_requires_evidence");
  const pressured = conceptCount > maxConceptCount || overlapFindings > maxOverlapFindings || driftScore > maxDriftScore;
  return {
    status: pressured ? "ONTOLOGY_PRESSURE_DETECTED" as const : "ONTOLOGY_PRESSURE_BOUNDED" as const,
    conceptCount,
    maxConceptCount,
    overlapFindings,
    maxOverlapFindings,
    driftScore,
    maxDriftScore,
    recommendationOnly: true,
    evidenceIds: [...evidenceIds]
  };
}
