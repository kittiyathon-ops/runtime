export interface LiveExecutionCertificationInput {
  readonly duplicateExecutions: number;
  readonly ghostOrders: number;
  readonly unreconciledExposure: number;
  readonly directExchangeMutationBypass: boolean;
  readonly restOnlyFinality: boolean;
  readonly websocketOnlyFinality: boolean;
  readonly unattestedExecutions: number;
  readonly ordersMissingIdempotencyKeys: number;
  readonly pendingOrdersUnrecovered: number;
}

export function liveExecutionCertification(input: LiveExecutionCertificationInput, evidenceIds: string[]) {
  if (Object.values(input).some((value) => typeof value === "number" && value < 0) || evidenceIds.length === 0) throw new Error("live_execution_certification_requires_evidence");
  const failures: string[] = [];
  if (input.duplicateExecutions > 0) failures.push("duplicate_execution");
  if (input.ghostOrders > 0) failures.push("ghost_order");
  if (input.unreconciledExposure > 0) failures.push("unreconciled_exposure");
  if (input.directExchangeMutationBypass) failures.push("direct_exchange_mutation_bypass");
  if (input.restOnlyFinality) failures.push("rest_only_finality");
  if (input.websocketOnlyFinality) failures.push("websocket_only_finality");
  if (input.unattestedExecutions > 0) failures.push("unattested_execution");
  if (input.ordersMissingIdempotencyKeys > 0) failures.push("missing_idempotency_key");
  if (input.pendingOrdersUnrecovered > 0) failures.push("pending_order_unrecovered");
  return { status: failures.length === 0 ? "LIVE_EXECUTION_CERTIFIED" as const : "LIVE_EXECUTION_CERTIFICATION_FAILED" as const, failures, evidenceIds: [...evidenceIds] };
}
