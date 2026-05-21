export function pressureAttestation(traceId: string, replayable: boolean, boundedDivergence: boolean, continuityPreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("pressure_attestation_requires_evidence");
  const attested = replayable && boundedDivergence && continuityPreserved;
  return { traceId, status: attested ? "PRESSURE_ATTESTED" as const : "PRESSURE_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
