export interface OverrideAnalysisReport {
  status: "NORMAL" | "ABUSE_RISK";
  overrideRate: number;
  evidenceIds: string[];
}

export function overrideAnalysis(overrides: number, governanceActions: number, evidenceIds: string[]): OverrideAnalysisReport {
  if (governanceActions <= 0) throw new Error("governance_actions_invalid");
  const overrideRate = overrides / governanceActions;
  return { status: overrideRate >= 0.25 ? "ABUSE_RISK" : "NORMAL", overrideRate, evidenceIds: [...evidenceIds] };
}
