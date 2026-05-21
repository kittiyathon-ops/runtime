export function rollbackHorizon(rollbackableSteps: number, requiredSteps: number, evidenceIds: string[]) {
  if (rollbackableSteps < 0 || requiredSteps < 0 || evidenceIds.length === 0) throw new Error("rollback_horizon_requires_evidence");
  return { status: rollbackableSteps >= requiredSteps ? "ROLLBACK_SAFE" as const : "ROLLBACK_UNSAFE" as const, evidenceIds: [...evidenceIds] };
}
