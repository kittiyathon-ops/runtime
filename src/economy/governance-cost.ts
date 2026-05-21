export function governanceCost(policyCount: number, overrideCount: number, conflictCount: number, maxCost: number, evidenceIds: string[]) {
  if (policyCount < 0 || overrideCount < 0 || conflictCount < 0 || maxCost <= 0 || evidenceIds.length === 0) throw new Error("governance_cost_requires_evidence");
  const cost = policyCount + overrideCount * 2 + conflictCount * 3;
  return { status: cost <= maxCost ? "GOVERNANCE_COST_BOUNDED" as const : "GOVERNANCE_COST_EXCESSIVE" as const, cost, maxCost, evidenceIds: [...evidenceIds] };
}
