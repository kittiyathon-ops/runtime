export function fragmentationPressure(worldCount: number, disputedWorlds: number, evidenceIds: string[]) {
  if (worldCount <= 0) throw new Error("world_count_invalid");
  if (evidenceIds.length === 0) throw new Error("fragmentation_pressure_requires_evidence");
  const score = disputedWorlds / worldCount;
  return { status: score >= 0.5 ? "FRAGMENTING" as const : "STABLE" as const, score, evidenceIds: [...evidenceIds] };
}
