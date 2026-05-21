export function coldStartRecovery(checks: readonly { checkId: string; passed: boolean; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (checks.length === 0 || evidenceIds.length === 0) throw new Error("cold_start_recovery_requires_evidence");
  const failed = checks.filter((check) => {
    if (check.checkId.length === 0 || check.evidenceIds.length === 0) throw new Error("cold_start_check_requires_evidence");
    return !check.passed;
  }).map((check) => check.checkId).sort();
  return { status: failed.length === 0 ? "COLD_START_RECOVERED" as const : "CONSTITUTIONAL_FAILURE_REQUIRED" as const, failed, evidenceIds: [...evidenceIds] };
}
