export function governanceConsistency(firstDecisionDigest: string, secondDecisionDigest: string, authorityBoundaryPreserved: boolean, evidenceIds: string[]) {
  if (firstDecisionDigest.length === 0 || secondDecisionDigest.length === 0 || evidenceIds.length === 0) throw new Error("governance_consistency_requires_evidence");
  return {
    status: firstDecisionDigest === secondDecisionDigest && authorityBoundaryPreserved ? "GOVERNANCE_CONSISTENT" as const : "GOVERNANCE_INCONSISTENT_FAIL_CLOSED" as const,
    firstDecisionDigest,
    secondDecisionDigest,
    authorityBoundaryPreserved,
    evidenceIds: [...evidenceIds]
  };
}
