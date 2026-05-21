export function runtimeAttestation(traceId: string, certified: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("runtime_attestation_requires_evidence");
  return { traceId, status: certified ? "RUNTIME_ATTESTED" as const : "RUNTIME_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
