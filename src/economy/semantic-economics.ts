export function semanticEconomics(meaningDensity: number, operationalValue: number, evidenceIds: string[]) {
  if (meaningDensity < 0 || operationalValue < 0 || evidenceIds.length === 0) throw new Error("semantic_economics_requires_evidence");
  const ratio = operationalValue === 0 ? meaningDensity : meaningDensity / operationalValue;
  return { status: ratio > 2 ? "SEMANTIC_COST_EXCESSIVE" as const : "SEMANTIC_VALUE_BALANCED" as const, ratio, evidenceIds: [...evidenceIds] };
}
