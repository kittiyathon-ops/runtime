export function stabilizationCost(complexity: number, pressure: number, evidenceIds: string[]) {
  if (complexity < 0 || pressure < 0 || evidenceIds.length === 0) throw new Error("stabilization_cost_requires_evidence");
  const cost = complexity + pressure;
  return { cost, status: cost <= 1 ? "AFFORDABLE" as const : "EXPENSIVE" as const, evidenceIds: [...evidenceIds] };
}
