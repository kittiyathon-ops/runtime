export function minimalKernelTruth(auditable: boolean, replayable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("minimal_kernel_truth_requires_evidence");
  return { status: auditable && replayable ? "KERNEL_TRUTH_USABLE" as const : "KERNEL_TRUTH_UNSAFE" as const, evidenceIds: [...evidenceIds] };
}
