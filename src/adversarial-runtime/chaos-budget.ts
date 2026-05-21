export function chaosBudget(used: number, budget: number, evidenceIds: string[]) {
  if (used < 0 || budget < 0 || evidenceIds.length === 0) throw new Error("chaos_budget_requires_evidence");
  return { status: used <= budget ? "CHAOS_BOUNDED" as const : "CHAOS_EXCEEDED" as const, used, budget, evidenceIds: [...evidenceIds] };
}
