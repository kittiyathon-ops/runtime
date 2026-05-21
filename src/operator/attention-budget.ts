export function operatorAttentionBudget(used: number, budget: number, evidenceIds: string[]) {
  if (used < 0 || budget < 0 || evidenceIds.length === 0) throw new Error("operator_attention_budget_requires_evidence");
  return { status: used <= budget ? "ATTENTION_BOUNDED" as const : "ATTENTION_EXCEEDED" as const, used, budget, evidenceIds: [...evidenceIds] };
}
