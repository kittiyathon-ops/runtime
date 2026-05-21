export function horizonAttestation(traceId: string, replayStable: boolean, identityStable: boolean, entropyBounded: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("horizon_attestation_requires_evidence");
  const attested = replayStable && identityStable && entropyBounded;
  return { traceId, status: attested ? "HORIZON_ATTESTED" as const : "HORIZON_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
