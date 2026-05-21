export function degradationScore(pressure: number, maxPressure: number, evidenceIds: string[]) {
  if (pressure < 0 || maxPressure <= 0 || evidenceIds.length === 0) throw new Error("degradation_score_requires_evidence");
  const score = pressure / maxPressure;
  return { score, status: score > 0.7 ? "DEGRADATION_HIGH" as const : "DEGRADATION_BOUNDED" as const, evidenceIds: [...evidenceIds] };
}
