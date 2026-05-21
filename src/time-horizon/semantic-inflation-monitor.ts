export function semanticInflationMonitor(semanticGrowth: number, maxGrowth: number, evidenceIds: string[]) {
  if (semanticGrowth < 0 || maxGrowth < 0 || evidenceIds.length === 0) throw new Error("semantic_inflation_monitor_requires_evidence");
  return { status: semanticGrowth <= maxGrowth ? "SEMANTIC_GROWTH_BOUNDED" as const : "SEMANTIC_INFLATION_DETECTED" as const, semanticGrowth, maxGrowth, evidenceIds: [...evidenceIds] };
}
