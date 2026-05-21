export function replayValidationAttestation(traceId: string, allValid: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("replay_validation_attestation_requires_evidence");
  return { traceId, status: allValid ? "REPLAY_VALIDATION_ATTESTED" as const : "REPLAY_VALIDATION_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
