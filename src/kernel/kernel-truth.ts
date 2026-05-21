export function kernelTruth(causallyExplainable: boolean, replayable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("kernel_truth_requires_evidence");
  return { status: causallyExplainable && replayable ? "TRUSTED" as const : "UNUSABLE" as const, evidenceIds: [...evidenceIds] };
}
