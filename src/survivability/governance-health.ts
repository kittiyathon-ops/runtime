export function governanceHealth(legitimacy: number, overridePressure: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_health_requires_evidence");
  const score = Math.max(0, legitimacy - overridePressure);
  return { score, status: score >= 0.7 ? "GOVERNANCE_HEALTHY" as const : "GOVERNANCE_DEGRADED" as const, evidenceIds: [...evidenceIds] };
}
