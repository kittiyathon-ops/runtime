export function minimalKernelCausality(previousSeq: number, nextSeq: number, evidenceIds: string[]) {
  if (previousSeq < 0 || nextSeq < 0 || evidenceIds.length === 0) throw new Error("minimal_kernel_causality_requires_evidence");
  return { status: nextSeq >= previousSeq ? "KERNEL_CAUSALITY_MONOTONIC" as const : "KERNEL_CAUSALITY_BROKEN" as const, evidenceIds: [...evidenceIds] };
}
