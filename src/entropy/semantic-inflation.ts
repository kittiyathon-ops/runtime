export function semanticInflation(semanticGrowth: number, executionGrowth: number, evidenceIds: string[]) {
  if (semanticGrowth < 0 || executionGrowth < 0 || evidenceIds.length === 0) throw new Error("semantic_inflation_requires_evidence");
  const ratio = executionGrowth === 0 ? semanticGrowth : semanticGrowth / executionGrowth;
  return { status: ratio > 2 ? "SEMANTIC_INFLATION" as const : "SEMANTIC_BOUNDED" as const, ratio, evidenceIds: [...evidenceIds] };
}
