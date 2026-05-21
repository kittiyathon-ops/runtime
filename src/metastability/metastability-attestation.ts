export function metastabilityAttestation(traceId: string, stable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("metastability_attestation_requires_evidence");
  return { traceId, status: stable ? "STABLE" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
