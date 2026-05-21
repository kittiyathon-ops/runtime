export function executionStatus(pendingOrders: number, unreconciledOrders: number, duplicateExecutions: number, evidenceIds: string[]) {
  if (pendingOrders < 0 || unreconciledOrders < 0 || duplicateExecutions < 0 || evidenceIds.length === 0) throw new Error("execution_status_requires_evidence");
  const blocked = unreconciledOrders > 0 || duplicateExecutions > 0;
  return { status: blocked ? "EXECUTION_REQUIRES_OPERATOR_ATTENTION" as const : "EXECUTION_CLEAR" as const, pendingOrders, unreconciledOrders, duplicateExecutions, evidenceIds: [...evidenceIds] };
}
