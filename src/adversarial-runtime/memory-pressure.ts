export function memoryPressure(usedMb: number, maxMb: number, evidenceIds: string[]) {
  if (usedMb < 0 || maxMb <= 0 || evidenceIds.length === 0) throw new Error("memory_pressure_requires_evidence");
  return { scenarioId: "memory_pressure", status: usedMb <= maxMb ? "CONTAINED" as const : "ESCALATED" as const, severity: usedMb <= maxMb ? 0 : 3, evidenceIds: [...evidenceIds] };
}
