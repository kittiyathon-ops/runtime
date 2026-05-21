import type { ParallelReality } from "./parallel-reality.js";

export function disputedWorlds(realities: readonly ParallelReality[]) {
  if (realities.length === 0) throw new Error("disputed_worlds_requires_realities");
  const disputed = realities.filter((reality) => reality.confidence < 0.7);
  return { status: disputed.length > 0 ? "DISPUTED" as const : "UNDISPUTED" as const, disputedRealityIds: disputed.map((reality) => reality.realityId) };
}
