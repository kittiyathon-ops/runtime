export function mortalityAttestation(traceId: string, terminalStateReplayable: boolean, constitutionalContinuityPreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("mortality_attestation_requires_evidence");
  const attested = terminalStateReplayable && constitutionalContinuityPreserved;
  return {
    traceId,
    status: attested ? "MORTALITY_ATTESTED" as const : "MORTALITY_REJECTED" as const,
    terminalStateReplayable,
    constitutionalContinuityPreserved,
    evidenceIds: [...evidenceIds]
  };
}
