export function explanationBudget(tokens: number, causalLinks: number, maxCost: number, evidenceIds: string[]) {
  if (tokens < 0 || causalLinks < 0 || maxCost <= 0 || evidenceIds.length === 0) throw new Error("explanation_budget_requires_evidence");
  const cost = tokens / 100 + causalLinks * 2;
  return { status: cost <= maxCost ? "EXPLANATION_AFFORDABLE" as const : "EXPLANATION_OVER_BUDGET" as const, cost, maxCost, evidenceIds: [...evidenceIds] };
}
