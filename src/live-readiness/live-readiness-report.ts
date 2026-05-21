export interface LiveReadinessInput {
  readonly deploymentProfile: string;
  readonly burnInStatus: string;
  readonly incidentHistoryCount: number;
  readonly activeScars: number;
  readonly reconciliationHealth: string;
  readonly replayHealth: string;
  readonly governanceHealth: string;
  readonly operatorReadiness: string;
  readonly executionSafetyStatus: string;
}

export function liveReadinessReport(input: LiveReadinessInput, evidenceIds: string[]) {
  if (input.deploymentProfile.length === 0 || input.incidentHistoryCount < 0 || input.activeScars < 0 || evidenceIds.length === 0) throw new Error("live_readiness_report_requires_evidence");
  const go = input.burnInStatus === "BURN_IN_CERTIFIED"
    && input.reconciliationHealth === "healthy"
    && input.replayHealth === "healthy"
    && input.governanceHealth === "healthy"
    && input.operatorReadiness === "ready"
    && input.executionSafetyStatus === "LIVE_EXECUTION_CERTIFIED";
  return {
    status: "LIVE_READINESS_REPORT_GENERATED" as const,
    recommendation: go ? "GO" as const : "NO_GO" as const,
    deploymentProfile: input.deploymentProfile,
    burnInStatus: input.burnInStatus,
    incidentHistoryCount: input.incidentHistoryCount,
    activeScars: input.activeScars,
    reconciliationHealth: input.reconciliationHealth,
    replayHealth: input.replayHealth,
    governanceHealth: input.governanceHealth,
    operatorReadiness: input.operatorReadiness,
    executionSafetyStatus: input.executionSafetyStatus,
    evidenceIds: [...evidenceIds]
  };
}
