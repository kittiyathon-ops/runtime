export function partialFailure(failedComponents: readonly string[], toleratedFailures: number, evidenceIds: string[]) {
  if (toleratedFailures < 0 || evidenceIds.length === 0) throw new Error("partial_failure_requires_evidence");
  return { scenarioId: "partial_failure", status: failedComponents.length <= toleratedFailures ? "CONTAINED" as const : "ESCALATED" as const, severity: Math.max(0, failedComponents.length - toleratedFailures), failedComponents: [...failedComponents].sort(), evidenceIds: [...evidenceIds] };
}
