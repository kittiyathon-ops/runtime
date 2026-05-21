export interface PerformanceBudget {
  p99LatencyMs: number;
  governanceEvaluationMs: number;
  replayDrift: number;
  memoryPressureBytes: number;
  eventQueueSaturation: number;
}

export interface PerformanceSample {
  p99LatencyMs: number;
  governanceEvaluationMs: number;
  replayDrift: number;
  memoryRssBytes: number;
  eventQueueDepth: number;
  eventQueueCapacity: number;
}

export interface PerformanceBudgetViolation {
  metric: keyof PerformanceBudget;
  value: number;
  limit: number;
  action: "WARN" | "DEGRADE" | "SAFE_MODE" | "HALT";
}

export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  p99LatencyMs: 50,
  governanceEvaluationMs: 5,
  replayDrift: 0,
  memoryPressureBytes: 1024 * 1024 * 1024,
  eventQueueSaturation: 0.8
};

export class PerformanceBudgetEvaluator {
  constructor(private readonly budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET) {}

  evaluate(sample: PerformanceSample): PerformanceBudgetViolation[] {
    if (sample.eventQueueCapacity <= 0) throw new Error("event_queue_capacity_invalid");
    const violations: PerformanceBudgetViolation[] = [];
    this.addIfBreached(violations, "p99LatencyMs", sample.p99LatencyMs, this.budget.p99LatencyMs, "DEGRADE");
    this.addIfBreached(violations, "governanceEvaluationMs", sample.governanceEvaluationMs, this.budget.governanceEvaluationMs, "SAFE_MODE");
    this.addIfBreached(violations, "replayDrift", sample.replayDrift, this.budget.replayDrift, "HALT");
    this.addIfBreached(violations, "memoryPressureBytes", sample.memoryRssBytes, this.budget.memoryPressureBytes, "HALT");
    this.addIfBreached(violations, "eventQueueSaturation", sample.eventQueueDepth / sample.eventQueueCapacity, this.budget.eventQueueSaturation, "DEGRADE");
    return violations;
  }

  private addIfBreached(
    violations: PerformanceBudgetViolation[],
    metric: keyof PerformanceBudget,
    value: number,
    limit: number,
    action: PerformanceBudgetViolation["action"]
  ): void {
    if (!Number.isFinite(value) || value < 0) throw new Error(`performance_sample_invalid:${metric}`);
    if (value > limit) violations.push({ metric, value, limit, action });
  }
}
