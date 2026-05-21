export function constitutionalSurvival(doctrineContinuous: boolean, authorityContinuous: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("constitutional_survival_requires_evidence");
  return { status: doctrineContinuous && authorityContinuous ? "SURVIVES" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
