export function epistemicHealth(reliability: number, contradictionPressure: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("epistemic_health_requires_evidence");
  const score = Math.max(0, reliability - contradictionPressure);
  return { score, status: score >= 0.6 ? "EPISTEMIC_HEALTHY" as const : "EPISTEMIC_DEGRADED" as const, evidenceIds: [...evidenceIds] };
}
