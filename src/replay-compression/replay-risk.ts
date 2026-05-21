export function replayRisk(missingBoundaries: readonly string[], missingCausalEdges: readonly string[], governanceMeaningChanged: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("replay_risk_requires_evidence");
  const riskCount = missingBoundaries.length + missingCausalEdges.length + (governanceMeaningChanged ? 1 : 0);
  return {
    status: riskCount === 0 ? "REPLAY_COMPRESSION_RISK_CLEAR" as const : "REPLAY_COMPRESSION_RISK_REPORTED" as const,
    riskCount,
    missingBoundaries: [...missingBoundaries].sort(),
    missingCausalEdges: [...missingCausalEdges].sort(),
    governanceMeaningChanged,
    evidenceIds: [...evidenceIds]
  };
}
