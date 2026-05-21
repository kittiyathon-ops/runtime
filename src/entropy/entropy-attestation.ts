export function entropyAttestation(traceId: string, entropyBounded: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("entropy_attestation_requires_evidence");
  return { traceId, status: entropyBounded ? "ENTROPY_ATTESTED" as const : "ENTROPY_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
