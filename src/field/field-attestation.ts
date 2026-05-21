export function fieldAttestation(traceId: string, replaySafe: boolean, provenanceComplete: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("field_attestation_requires_evidence");
  const attested = replaySafe && provenanceComplete;
  return { traceId, status: attested ? "FIELD_ATTESTED" as const : "FIELD_REJECTED" as const, replaySafe, provenanceComplete, evidenceIds: [...evidenceIds] };
}
