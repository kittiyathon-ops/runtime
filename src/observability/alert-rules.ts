import type { PerformanceBudgetViolation } from "./performance-budget.js";

export interface ObservabilityAlert {
  alertId: string;
  timestamp: number;
  traceId: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  reason: string;
  evidenceIds: string[];
}

export class ObservabilityAlertRules {
  fromBudgetViolation(timestamp: number, traceId: string, violation: PerformanceBudgetViolation): ObservabilityAlert {
    if (traceId.length === 0) throw new Error("trace_id_required");
    return {
      alertId: `${traceId}:${violation.metric}`,
      timestamp,
      traceId,
      severity: violation.action === "HALT" || violation.action === "SAFE_MODE" ? "CRITICAL" : "WARNING",
      reason: `performance_budget:${violation.metric}:${violation.value}>${violation.limit}`,
      evidenceIds: [`budget:${violation.metric}`]
    };
  }
}
