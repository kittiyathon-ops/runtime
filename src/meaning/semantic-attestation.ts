export function semanticAttestation(traceId: string, stable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("semantic_attestation_requires_evidence");
  return { traceId, status: stable ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
