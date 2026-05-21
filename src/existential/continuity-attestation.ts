export function continuityAttestation(traceId: string, continuous: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("continuity_attestation_requires_evidence");
  return { traceId, status: continuous ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
