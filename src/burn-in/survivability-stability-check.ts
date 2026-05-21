export function survivabilityStabilityCheck(minScore: number, requiredMinScore: number, observedDays: number, evidenceIds: string[]) {
  if (minScore < 0 || requiredMinScore < 0 || observedDays < 0 || evidenceIds.length === 0) throw new Error("survivability_stability_check_requires_evidence");
  return { status: minScore >= requiredMinScore && observedDays >= 90 ? "SURVIVABILITY_STABLE_90D_PASSED" as const : "SURVIVABILITY_STABLE_90D_FAILED" as const, minScore, requiredMinScore, observedDays, evidenceIds: [...evidenceIds] };
}
