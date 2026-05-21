export function constitutionalFatigue(emergencyOverrides: number, manualReviews: number, maxLoad: number, evidenceIds: string[]) {
  if (maxLoad <= 0) throw new Error("constitutional_fatigue_load_invalid");
  if (evidenceIds.length === 0) throw new Error("constitutional_fatigue_requires_evidence");
  const score = Math.min(1, (emergencyOverrides * 2 + manualReviews) / maxLoad);
  return { status: score >= 0.7 ? "FATIGUED" as const : "STABLE" as const, score, evidenceIds: [...evidenceIds] };
}
