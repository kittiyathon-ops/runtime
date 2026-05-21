export function arbitrationAttestation(traceId: string, final: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("arbitration_attestation_requires_evidence");
  return { traceId, status: final ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
