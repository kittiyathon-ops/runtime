export function survivabilityAttestation(traceId: string, scoreSurvivable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("survivability_attestation_requires_evidence");
  return { traceId, status: scoreSurvivable ? "SURVIVABILITY_ATTESTED" as const : "SURVIVABILITY_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
