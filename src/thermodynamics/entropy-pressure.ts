export function entropyPressure(events: number, contradictions: number, recursiveDepth: number, evidenceIds: string[]) {
  if (events <= 0 || evidenceIds.length === 0) throw new Error("entropy_pressure_requires_evidence");
  const score = Math.min(1, (contradictions + recursiveDepth) / events);
  return { status: score >= 0.7 ? "HIGH_ENTROPY" as const : "BOUNDED" as const, score, evidenceIds: [...evidenceIds] };
}
