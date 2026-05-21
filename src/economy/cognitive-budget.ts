export function cognitiveBudget(attentionCost: number, governanceCostValue: number, explanationCost: number, budget: number, evidenceIds: string[]) {
  if (attentionCost < 0 || governanceCostValue < 0 || explanationCost < 0 || budget <= 0 || evidenceIds.length === 0) throw new Error("cognitive_budget_requires_evidence");
  const total = attentionCost + governanceCostValue + explanationCost;
  return { status: total <= budget ? "COGNITIVE_BUDGET_OK" as const : "COGNITIVE_BUDGET_EXCEEDED" as const, total, budget, evidenceIds: [...evidenceIds] };
}
