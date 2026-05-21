export function kernelTruth(truthTransitions: readonly string[], replayedTransitions: readonly string[], evidenceIds: string[]) {
  if (truthTransitions.length === 0 || replayedTransitions.length === 0 || evidenceIds.length === 0) throw new Error("kernel_truth_requires_evidence");
  const expected = [...truthTransitions];
  const actual = [...replayedTransitions];
  const preserved = expected.length === actual.length && expected.every((transition, index) => transition === actual[index]);
  return {
    status: preserved ? "OPERATIONAL_TRUTH_PRESERVED" as const : "OPERATIONAL_TRUTH_DIVERGED" as const,
    transitionCount: expected.length,
    preserved,
    evidenceIds: [...evidenceIds]
  };
}
