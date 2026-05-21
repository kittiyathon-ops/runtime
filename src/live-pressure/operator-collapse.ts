export function operatorCollapse(ignoredAlerts: number, delayedInterventions: number, contradictoryOverrides: number, fatigueEvents: number, maxCollapseScore: number, evidenceIds: string[]) {
  if ([ignoredAlerts, delayedInterventions, contradictoryOverrides, fatigueEvents, maxCollapseScore].some((value) => value < 0) || evidenceIds.length === 0) {
    throw new Error("operator_collapse_requires_evidence");
  }
  const collapseScore = ignoredAlerts + delayedInterventions * 2 + contradictoryOverrides * 3 + fatigueEvents;
  return { status: collapseScore <= maxCollapseScore ? "OPERATOR_SURVIVABLE" as const : "OPERATOR_COLLAPSE_RISK" as const, collapseScore, maxCollapseScore, evidenceIds: [...evidenceIds] };
}
