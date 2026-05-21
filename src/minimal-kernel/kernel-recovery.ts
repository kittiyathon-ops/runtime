export function minimalKernelRecovery(recoveryPath: boolean, continuityPreserved: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("minimal_kernel_recovery_requires_evidence");
  return { status: recoveryPath && continuityPreserved ? "KERNEL_RECOVERY_READY" as const : "KERNEL_RECOVERY_UNSAFE" as const, evidenceIds: [...evidenceIds] };
}
