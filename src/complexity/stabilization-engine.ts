import { ComplexityCollapseDetector, type ComplexityCollapseReport } from "./complexity-collapse.js";
import type { ComplexityDecision } from "./complexity-types.js";

export interface StabilizationReport extends ComplexityCollapseReport {
  preserveConstitutionalContinuity: true;
  preserveReplayability: true;
  explanation: string[];
}

export class StabilizationEngine {
  stabilize(decisions: readonly ComplexityDecision[]): StabilizationReport {
    const collapse = new ComplexityCollapseDetector().detect(decisions);
    return {
      ...collapse,
      preserveConstitutionalContinuity: true,
      preserveReplayability: true,
      explanation: decisions.map((decision) => `${decision.reason}:${decision.status}:${decision.score.toFixed(4)}`)
    };
  }
}
