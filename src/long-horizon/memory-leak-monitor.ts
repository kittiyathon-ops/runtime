export function memoryLeakMonitor(memoryGrowthPerDay: number, maxGrowthPerDay: number, evidenceIds: string[]) {
  if (memoryGrowthPerDay < 0 || maxGrowthPerDay < 0 || evidenceIds.length === 0) throw new Error("memory_leak_monitor_requires_evidence");
  return { status: memoryGrowthPerDay <= maxGrowthPerDay ? "MEMORY_GROWTH_BOUNDED" as const : "MEMORY_LEAK_RISK_DETECTED" as const, memoryGrowthPerDay, maxGrowthPerDay, evidenceIds: [...evidenceIds] };
}
