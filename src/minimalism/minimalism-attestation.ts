export function minimalismAttestation(traceId: string, deterministicScoring: boolean, explainableScoring: boolean, destructiveRefactor: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("minimalism_attestation_requires_evidence");
  return {
    traceId,
    status: deterministicScoring && explainableScoring && !destructiveRefactor ? "MINIMALISM_ATTESTED" as const : "MINIMALISM_ATTESTATION_REJECTED" as const,
    deterministicScoring,
    explainableScoring,
    destructiveRefactor,
    evidenceIds: [...evidenceIds]
  };
}
