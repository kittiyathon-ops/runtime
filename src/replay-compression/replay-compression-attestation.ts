export function replayCompressionAttestation(traceId: string, certifierStatus: string, proofOrRiskProduced: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("replay_compression_attestation_requires_evidence");
  return {
    traceId,
    status: proofOrRiskProduced ? "REPLAY_COMPRESSION_ATTESTED" as const : "REPLAY_COMPRESSION_ATTESTATION_REJECTED" as const,
    certifierStatus,
    compressionRequiresProofOrRiskReport: true,
    evidenceIds: [...evidenceIds]
  };
}
