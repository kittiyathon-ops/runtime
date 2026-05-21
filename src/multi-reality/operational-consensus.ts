import type { ParallelReality } from "./parallel-reality.js";

export function operationalConsensus(realities: readonly ParallelReality[], threshold: number) {
  if (threshold < 0 || threshold > 1) throw new Error("consensus_threshold_invalid");
  const sorted = [...realities].sort((left, right) => right.confidence - left.confidence || left.realityId.localeCompare(right.realityId));
  const selected = sorted[0];
  if (selected === undefined) throw new Error("consensus_requires_realities");
  return { status: selected.confidence >= threshold ? "CONSENSUS" as const : "NO_CONSENSUS" as const, selectedRealityId: selected.realityId, confidence: selected.confidence, evidenceIds: selected.provenanceIds };
}
