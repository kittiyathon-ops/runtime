export interface PolicyStabilityReport {
  status: "STABLE" | "UNSTABLE";
  changeRate: number;
  evidenceIds: string[];
}

export function policyStability(policyChanges: number, windowEvents: number, evidenceIds: string[]): PolicyStabilityReport {
  if (windowEvents <= 0) throw new Error("policy_window_invalid");
  const changeRate = policyChanges / windowEvents;
  if (changeRate >= 0.5 && evidenceIds.length === 0) throw new Error("policy_instability_requires_evidence");
  return { status: changeRate >= 0.5 ? "UNSTABLE" : "STABLE", changeRate, evidenceIds: [...evidenceIds] };
}
