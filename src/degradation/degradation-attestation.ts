export function degradationAttestation(traceId: string, sequenceReplayable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("degradation_attestation_requires_evidence");
  return { traceId, status: sequenceReplayable ? "DEGRADATION_ATTESTED" as const : "DEGRADATION_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
