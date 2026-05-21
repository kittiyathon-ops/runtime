export function compressionPassAttestation(traceId: string, replayPreserved: boolean, explainabilityPreserved: boolean, constitutionalContinuityPreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("compression_pass_attestation_requires_evidence");
  const attested = replayPreserved && explainabilityPreserved && constitutionalContinuityPreserved;
  return { traceId, status: attested ? "COMPRESSION_PASS_ATTESTED" as const : "COMPRESSION_PASS_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
