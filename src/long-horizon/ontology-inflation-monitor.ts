export function ontologyInflationMonitor(conceptGrowthPerDay: number, maxGrowthPerDay: number, evidenceIds: string[]) {
  if (conceptGrowthPerDay < 0 || maxGrowthPerDay < 0 || evidenceIds.length === 0) throw new Error("ontology_inflation_monitor_requires_evidence");
  return { status: conceptGrowthPerDay <= maxGrowthPerDay ? "ONTOLOGY_INFLATION_BOUNDED" as const : "ONTOLOGY_INFLATION_DETECTED" as const, conceptGrowthPerDay, maxGrowthPerDay, evidenceIds: [...evidenceIds] };
}
