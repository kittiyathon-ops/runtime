export function legitimacyPressure(overrides: number, breaches: number, validations: number, evidenceIds: string[]) {
  if (validations <= 0) throw new Error("legitimacy_validation_count_invalid");
  if (evidenceIds.length === 0) throw new Error("legitimacy_pressure_requires_evidence");
  const score = Math.min(1, (overrides + breaches * 2) / validations);
  return { status: score >= 0.7 ? "CRITICAL" as const : score > 0 ? "ELEVATED" as const : "LOW" as const, score, evidenceIds: [...evidenceIds] };
}
