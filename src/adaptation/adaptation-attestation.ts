export function adaptationAttestation(traceId: string, bounded: boolean, reversible: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("adaptation_attestation_requires_evidence");
  return { traceId, status: bounded && reversible ? "ADAPTATION_ATTESTED" as const : "ADAPTATION_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
