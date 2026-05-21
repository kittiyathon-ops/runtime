import { causalDepthBudget } from "./causal-depth-budget.js";

export interface CausalDepthInput {
  currentDepth: number;
  maxDepth: number;
  evidenceIds: string[];
}

export function causalDepth(input: CausalDepthInput) {
  return causalDepthBudget(input.currentDepth, input.maxDepth, input.evidenceIds);
}
