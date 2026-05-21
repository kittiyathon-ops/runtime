export function burnInRunner(checkStatuses: readonly string[], evidenceIds: string[]) {
  if (checkStatuses.length === 0 || evidenceIds.length === 0) throw new Error("burn_in_runner_requires_evidence");
  const failed = checkStatuses.filter((status) => status.endsWith("_FAILED")).sort();
  return { status: failed.length === 0 ? "BURN_IN_RUN_PASSED" as const : "BURN_IN_RUN_FAILED" as const, failed, evidenceIds: [...evidenceIds] };
}
