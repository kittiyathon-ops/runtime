export interface OperatorSummaryInput {
  readonly currentMode: string;
  readonly currentExposure: number;
  readonly pendingOrders: number;
  readonly reconciliationStatus: string;
  readonly activeIncidents: number;
  readonly governanceBlocks: readonly string[];
  readonly liveRiskFlags: readonly string[];
  readonly requiredOperatorActions: readonly string[];
}

export function operatorSummary(input: OperatorSummaryInput, evidenceIds: string[]) {
  if (input.currentMode.length === 0 || input.currentExposure < 0 || input.pendingOrders < 0 || input.reconciliationStatus.length === 0 || input.activeIncidents < 0 || evidenceIds.length === 0) throw new Error("operator_summary_requires_evidence");
  const actionRequired = input.activeIncidents > 0 || input.governanceBlocks.length > 0 || input.liveRiskFlags.length > 0 || input.requiredOperatorActions.length > 0;
  return {
    status: actionRequired ? "OPERATOR_ACTION_REQUIRED" as const : "OPERATOR_CLEAR" as const,
    currentMode: input.currentMode,
    currentExposure: input.currentExposure,
    pendingOrders: input.pendingOrders,
    reconciliationStatus: input.reconciliationStatus,
    activeIncidents: input.activeIncidents,
    governanceBlocks: [...input.governanceBlocks].sort(),
    liveRiskFlags: [...input.liveRiskFlags].sort(),
    requiredOperatorActions: [...input.requiredOperatorActions].sort(),
    evidenceIds: [...evidenceIds]
  };
}
