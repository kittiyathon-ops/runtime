export function minimalKernelDegradation(deterministic: boolean, safeHaltAvailable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("minimal_kernel_degradation_requires_evidence");
  return { status: deterministic && safeHaltAvailable ? "KERNEL_DEGRADATION_READY" as const : "KERNEL_DEGRADATION_UNSAFE" as const, evidenceIds: [...evidenceIds] };
}
