import type { ComplexityDecision } from "./complexity-types.js";

export interface ComplexityCollapseReport {
  status: "SURVIVABLE" | "COLLAPSE_IMMINENT";
  action: "CONTINUE" | "THROTTLE_COGNITION" | "SAFE_MODE";
  evidenceIds: string[];
}

export class ComplexityCollapseDetector {
  detect(decisions: readonly ComplexityDecision[]): ComplexityCollapseReport {
    if (decisions.length === 0) throw new Error("collapse_detection_requires_decisions");
    const evidenceIds = Array.from(new Set(decisions.flatMap((decision) => decision.evidenceIds)));
    if (decisions.some((decision) => decision.status === "COLLAPSE_RISK")) {
      return { status: "COLLAPSE_IMMINENT", action: "SAFE_MODE", evidenceIds };
    }
    if (decisions.some((decision) => decision.status === "DEGRADED")) {
      return { status: "SURVIVABLE", action: "THROTTLE_COGNITION", evidenceIds };
    }
    return { status: "SURVIVABLE", action: "CONTINUE", evidenceIds };
  }
}
