export function entropyBudget(entropyScores: readonly number[], budget: number, evidenceIds: string[]) {
  if (entropyScores.length === 0 || budget < 0 || evidenceIds.length === 0) throw new Error("entropy_budget_requires_evidence");
  const total = entropyScores.reduce((sum, score) => sum + score, 0);
  return { status: total <= budget ? "ENTROPY_BUDGET_OK" as const : "ENTROPY_BUDGET_EXCEEDED" as const, total, budget, evidenceIds: [...evidenceIds] };
}
