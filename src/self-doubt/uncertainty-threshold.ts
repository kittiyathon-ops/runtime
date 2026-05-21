export function uncertaintyThreshold(uncertainty: number, threshold: number, evidenceIds: string[]) {
  if (uncertainty < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("uncertainty_threshold_requires_evidence");
  return { status: uncertainty > threshold ? "SAFE_MODE_REQUIRED" as const : "UNCERTAINTY_BOUNDED" as const, uncertainty, threshold, evidenceIds: [...evidenceIds] };
}
