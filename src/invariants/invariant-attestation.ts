export function invariantAttestation(traceId: string, allPreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("invariant_attestation_requires_evidence");
  return { traceId, status: allPreserved ? "INVARIANTS_ATTESTED" as const : "INVARIANTS_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
