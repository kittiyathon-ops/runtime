export function survivabilityKernelAttestation(traceId: string, kernelComplete: boolean, stateMinimal: boolean, recoveryReady: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("survivability_kernel_attestation_requires_evidence");
  return {
    traceId,
    status: kernelComplete && stateMinimal && recoveryReady ? "SURVIVABILITY_KERNEL_ATTESTED" as const : "SURVIVABILITY_KERNEL_REJECTED" as const,
    evidenceIds: [...evidenceIds]
  };
}
