export function reductionAttestation(traceId: string, recommendationsOnly: boolean, governanceApprovalRequired: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("reduction_attestation_requires_evidence");
  return {
    traceId,
    status: recommendationsOnly && governanceApprovalRequired ? "REDUCTION_ATTESTED_REVIEW_ONLY" as const : "REDUCTION_ATTESTATION_REJECTED" as const,
    autonomousOntologyMergeAllowed: false,
    doctrineMutationAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
