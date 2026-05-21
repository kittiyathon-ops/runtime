export function thermodynamicBudget(availableEnergy: number, stabilizationCost: number, evidenceIds: string[]) {
  if (availableEnergy < 0 || stabilizationCost < 0 || evidenceIds.length === 0) throw new Error("thermodynamic_budget_requires_evidence");
  return { status: availableEnergy >= stabilizationCost ? "WITHIN_BUDGET" as const : "OVER_BUDGET" as const, availableEnergy, stabilizationCost, evidenceIds: [...evidenceIds] };
}
