export function entropyGovernanceDrift(drift: number, threshold: number, evidenceIds: string[]) {
  if (drift < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("entropy_governance_drift_requires_evidence");
  return { status: drift > threshold ? "GOVERNANCE_DRIFTING" as const : "GOVERNANCE_STABLE" as const, drift, threshold, evidenceIds: [...evidenceIds] };
}
