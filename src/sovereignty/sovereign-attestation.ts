export function sovereignAttestation(traceId: string, legitimate: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("sovereign_attestation_requires_evidence");
  return { traceId, status: legitimate ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
