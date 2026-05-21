export function certificationAttestation(traceId: string, certified: boolean, evidencePreserved: boolean, lineagePreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("certification_attestation_requires_evidence");
  return {
    traceId,
    status: certified && evidencePreserved && lineagePreserved ? "REPLAY_CERTIFICATION_ATTESTED" as const : "REPLAY_CERTIFICATION_REJECTED" as const,
    evidenceIds: [...evidenceIds]
  };
}
