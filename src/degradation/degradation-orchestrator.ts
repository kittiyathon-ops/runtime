export function degradationOrchestrator(signals: readonly string[], evidenceIds: string[]) {
  if (signals.length === 0 || evidenceIds.length === 0) throw new Error("degradation_orchestrator_requires_evidence");
  const order = ["FREEZE_GOVERNANCE_MUTATION", "DISABLE_ADAPTATION", "REDUCE_COGNITION", "ENTER_SAFE_MODE"].filter((signal) => signals.includes(signal));
  return { status: order.length > 0 ? "DEGRADATION_REQUIRED" as const : "DEGRADATION_NOT_REQUIRED" as const, order, evidenceIds: [...evidenceIds] };
}
