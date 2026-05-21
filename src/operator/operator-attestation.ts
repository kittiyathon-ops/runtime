export function operatorAttestation(traceId: string, interpretable: boolean, escalationReplayable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("operator_attestation_requires_evidence");
  return { traceId, status: interpretable && escalationReplayable ? "OPERATOR_ATTESTED" as const : "OPERATOR_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
