export function minimalKernelContinuity(identity: boolean, causality: boolean, truth: boolean, recovery: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("minimal_kernel_continuity_requires_evidence");
  const continuous = identity && causality && truth && recovery;
  return { status: continuous ? "KERNEL_CONTINUITY_PRESERVED" as const : "KERNEL_CONTINUITY_BROKEN" as const, evidenceIds: [...evidenceIds] };
}
