export function burnInMemoryPressure(bytesUsed: number, maxBytes: number, evidenceIds: string[]) {
  if (bytesUsed < 0 || maxBytes < 0 || evidenceIds.length === 0) throw new Error("burn_in_memory_pressure_requires_evidence");
  return { scenarioId: "memory_pressure", status: bytesUsed <= maxBytes ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, bytesUsed, maxBytes, evidenceIds: [...evidenceIds] };
}
