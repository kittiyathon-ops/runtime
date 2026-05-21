import type { ParallelReality } from "./parallel-reality.js";

export function realityWeighting(realities: readonly ParallelReality[]) {
  const total = realities.reduce((sum, reality) => sum + reality.confidence, 0);
  if (total <= 0) throw new Error("reality_weighting_total_invalid");
  return realities.map((reality) => ({ realityId: reality.realityId, weight: reality.confidence / total, evidenceIds: [...reality.provenanceIds] }));
}
