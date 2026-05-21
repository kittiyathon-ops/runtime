export function staleTruth(ageMs: number, maxAgeMs: number, evidenceIds: string[]) {
  if (ageMs < 0 || maxAgeMs < 0 || evidenceIds.length === 0) throw new Error("stale_truth_requires_evidence");
  return { scenarioId: "stale_truth", status: ageMs <= maxAgeMs ? "CONTAINED" as const : "ESCALATED" as const, severity: ageMs <= maxAgeMs ? 0 : 3, evidenceIds: [...evidenceIds] };
}
