export function runawayDetector(rate: number, threshold: number, evidenceIds: string[]) {
  if (threshold <= 0 || evidenceIds.length === 0) throw new Error("runaway_detector_requires_evidence");
  return { status: rate > threshold ? "RUNAWAY" as const : "BOUNDED" as const, rate, threshold, evidenceIds: [...evidenceIds] };
}
