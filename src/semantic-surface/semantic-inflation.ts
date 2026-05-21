export function semanticInflation(previousConceptCount: number, currentConceptCount: number, maxGrowthRatio: number, evidenceIds: string[]) {
  if (previousConceptCount < 0 || currentConceptCount < 0 || maxGrowthRatio < 0 || evidenceIds.length === 0) throw new Error("semantic_inflation_requires_evidence");
  const growthRatio = previousConceptCount === 0 ? currentConceptCount : (currentConceptCount - previousConceptCount) / previousConceptCount;
  return {
    status: growthRatio <= maxGrowthRatio ? "SEMANTIC_INFLATION_BOUNDED" as const : "SEMANTIC_INFLATION_DETECTED" as const,
    previousConceptCount,
    currentConceptCount,
    growthRatio,
    evidenceIds: [...evidenceIds]
  };
}
