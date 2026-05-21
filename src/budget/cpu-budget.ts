export interface CpuBudgetSample {
  evaluationMs: number;
  executionThreadBlockedMs: number;
}

export interface CpuBudgetDecision {
  status: "OK" | "DEGRADED" | "SAFE_MODE";
  reason: string;
  degradeCognition: boolean;
}

export class CpuBudget {
  constructor(private readonly maxEvaluationMs = 5, private readonly maxExecutionBlockMs = 10) {}

  evaluate(sample: CpuBudgetSample): CpuBudgetDecision {
    if (sample.evaluationMs < 0 || sample.executionThreadBlockedMs < 0) throw new Error("cpu_budget_sample_invalid");
    if (sample.executionThreadBlockedMs > this.maxExecutionBlockMs) {
      return { status: "SAFE_MODE", reason: "execution_thread_blocked", degradeCognition: true };
    }
    if (sample.evaluationMs > this.maxEvaluationMs) {
      return { status: "DEGRADED", reason: "governance_evaluation_budget_exceeded", degradeCognition: true };
    }
    return { status: "OK", reason: "cpu_budget_ok", degradeCognition: false };
  }
}
