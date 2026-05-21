export function economyAttestation(traceId: string, budgetRespected: boolean, operatorInterpretable: boolean, provenanceComplete: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("economy_attestation_requires_evidence");
  const attested = budgetRespected && operatorInterpretable && provenanceComplete;
  return { traceId, status: attested ? "ECONOMY_ATTESTED" as const : "ECONOMY_REJECTED" as const, budgetRespected, operatorInterpretable, provenanceComplete, evidenceIds: [...evidenceIds] };
}
