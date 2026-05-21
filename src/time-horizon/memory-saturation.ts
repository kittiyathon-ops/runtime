export function memorySaturation(memoryUsed: number, memoryBudget: number, evidenceIds: string[]) {
  if (memoryUsed < 0 || memoryBudget < 0 || evidenceIds.length === 0) throw new Error("memory_saturation_requires_evidence");
  return { status: memoryUsed <= memoryBudget ? "MEMORY_BOUNDED_LONG_HORIZON" as const : "MEMORY_SATURATED" as const, memoryUsed, memoryBudget, evidenceIds: [...evidenceIds] };
}
