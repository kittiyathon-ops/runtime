export function coldStartAttestation(traceId: string, deterministic: boolean, identityRestored: boolean, governanceRestored: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("cold_start_attestation_requires_evidence");
  const attested = deterministic && identityRestored && governanceRestored;
  return { traceId, status: attested ? "COLD_START_ATTESTED" as const : "COLD_START_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
