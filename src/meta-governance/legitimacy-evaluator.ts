import type { ConstitutionalPressureReport } from "./constitutional-pressure.js";
import type { DoctrineConsistencyReport } from "./doctrine-consistency.js";
import type { GovernanceDriftReport } from "./governance-drift.js";
import type { OverrideAnalysisReport } from "./override-analysis.js";
import type { PolicyStabilityReport } from "./policy-stability.js";

export interface GovernanceLegitimacyReport {
  status: "LEGITIMATE" | "DEGRADED" | "ILLEGITIMATE";
  reasons: string[];
  evidenceIds: string[];
}

export class LegitimacyEvaluator {
  evaluate(input: {
    doctrine: DoctrineConsistencyReport;
    stability: PolicyStabilityReport;
    overrides: OverrideAnalysisReport;
    drift: GovernanceDriftReport;
    constitutionalPressure: ConstitutionalPressureReport;
  }): GovernanceLegitimacyReport {
    const reasons: string[] = [];
    if (input.doctrine.status === "INCONSISTENT") reasons.push("doctrine_inconsistent");
    if (input.stability.status === "UNSTABLE") reasons.push("policy_unstable");
    if (input.overrides.status === "ABUSE_RISK") reasons.push("override_abuse_risk");
    if (input.drift.status === "DRIFTING") reasons.push("governance_drift");
    if (input.constitutionalPressure.status !== "LOW") reasons.push("constitutional_pressure");
    const evidenceIds = Array.from(new Set([
      ...input.doctrine.evidenceIds,
      ...input.stability.evidenceIds,
      ...input.overrides.evidenceIds,
      ...input.drift.evidenceIds,
      ...input.constitutionalPressure.evidenceIds
    ]));
    return {
      status: reasons.includes("doctrine_inconsistent") || reasons.includes("constitutional_pressure") && input.constitutionalPressure.status === "CRITICAL"
        ? "ILLEGITIMATE"
        : reasons.length > 0 ? "DEGRADED" : "LEGITIMATE",
      reasons,
      evidenceIds
    };
  }
}
