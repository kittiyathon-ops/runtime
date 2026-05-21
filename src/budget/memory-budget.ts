export interface MemoryBudgetDecision {
  status: "OK" | "DEGRADED" | "HALT";
  reason: string;
  memoryRssBytes: number;
  limitBytes: number;
}

export class MemoryBudget {
  constructor(private readonly warnBytes: number, private readonly hardLimitBytes: number) {
    if (warnBytes <= 0 || hardLimitBytes <= 0 || warnBytes > hardLimitBytes) throw new Error("memory_budget_invalid");
  }

  evaluate(memoryRssBytes: number): MemoryBudgetDecision {
    if (memoryRssBytes < 0) throw new Error("memory_sample_invalid");
    if (memoryRssBytes > this.hardLimitBytes) {
      return { status: "HALT", reason: "memory_budget_exceeded", memoryRssBytes, limitBytes: this.hardLimitBytes };
    }
    if (memoryRssBytes > this.warnBytes) {
      return { status: "DEGRADED", reason: "memory_pressure_warn", memoryRssBytes, limitBytes: this.warnBytes };
    }
    return { status: "OK", reason: "memory_budget_ok", memoryRssBytes, limitBytes: this.warnBytes };
  }
}
