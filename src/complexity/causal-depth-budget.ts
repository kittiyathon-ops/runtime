import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function causalDepthBudget(depth: number, maxDepth: number, evidenceIds: string[]): ComplexityDecision {
  if (maxDepth <= 0) throw new Error("causal_depth_budget_invalid");
  return complexityDecision(depth / maxDepth, "causal_depth_budget", evidenceIds);
}
