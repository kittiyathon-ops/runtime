export function minimalKernelAttestation(traceId: string, complete: boolean, continuityPreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("minimal_kernel_attestation_requires_evidence");
  return { traceId, status: complete && continuityPreserved ? "MINIMAL_KERNEL_ATTESTED" as const : "MINIMAL_KERNEL_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
