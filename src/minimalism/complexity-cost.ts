export function complexityCost(complexity: number, maintenance: number, operatorCognitive: number, entropy: number, evidenceIds: string[]) {
  if ([complexity, maintenance, operatorCognitive, entropy].some((value) => value < 0) || evidenceIds.length === 0) throw new Error("complexity_cost_requires_evidence");
  return { score: complexity + maintenance + operatorCognitive + entropy, complexity, maintenance, operatorCognitive, entropy, evidenceIds: [...evidenceIds] };
}
