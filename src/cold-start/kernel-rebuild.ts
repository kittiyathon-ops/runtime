export function kernelRebuild(identity: boolean, timeline: boolean, truth: boolean, governance: boolean, recovery: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("kernel_rebuild_requires_evidence");
  const rebuilt = identity && timeline && truth && governance && recovery;
  return { status: rebuilt ? "KERNEL_REBUILT" as const : "KERNEL_REBUILD_FAILED" as const, evidenceIds: [...evidenceIds] };
}
