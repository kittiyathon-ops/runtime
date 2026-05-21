export function kernelAttestation(traceId: string, viable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("kernel_attestation_requires_evidence");
  return { traceId, status: viable ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
