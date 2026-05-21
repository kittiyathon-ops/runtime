import type { ComplexityDecision } from "./complexity-types.js";

export interface InstabilityThresholdReport {
  status: "STABLE" | "UNSTABLE";
  worstScore: number;
  reasons: string[];
}

export class InstabilityThreshold {
  evaluate(decisions: readonly ComplexityDecision[]): InstabilityThresholdReport {
    if (decisions.length === 0) throw new Error("instability_requires_decisions");
    const worstScore = Math.max(...decisions.map((decision) => decision.score));
    return {
      status: decisions.some((decision) => decision.status === "COLLAPSE_RISK") ? "UNSTABLE" : "STABLE",
      worstScore,
      reasons: decisions.filter((decision) => decision.status !== "WITHIN_BUDGET").map((decision) => decision.reason)
    };
  }
}
