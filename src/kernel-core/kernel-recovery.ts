export function kernelRecovery(requiredOrder: readonly string[], observedOrder: readonly string[], evidenceIds: string[]) {
  if (requiredOrder.length === 0 || observedOrder.length === 0 || evidenceIds.length === 0) throw new Error("kernel_recovery_requires_evidence");
  const required = [...requiredOrder];
  const observed = [...observedOrder];
  const preserved = required.length <= observed.length && required.every((step, index) => step === observed[index]);
  return {
    status: preserved ? "RECOVERY_ORDERING_PRESERVED" as const : "RECOVERY_ORDERING_REJECTED" as const,
    requiredOrder: required,
    observedOrder: observed,
    evidenceIds: [...evidenceIds]
  };
}
