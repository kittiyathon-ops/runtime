export interface GovernanceDriftReport {
  status: "ALIGNED" | "DRIFTING";
  driftScore: number;
  reasons: string[];
  evidenceIds: string[];
}

export function governanceDrift(expectedPolicies: readonly string[], activePolicies: readonly string[], evidenceIds: string[]): GovernanceDriftReport {
  const active = new Set(activePolicies);
  const missing = expectedPolicies.filter((policy) => !active.has(policy));
  const driftScore = expectedPolicies.length === 0 ? 0 : missing.length / expectedPolicies.length;
  if (driftScore > 0 && evidenceIds.length === 0) throw new Error("governance_drift_requires_evidence");
  return { status: driftScore > 0 ? "DRIFTING" : "ALIGNED", driftScore, reasons: missing.map((policy) => `missing:${policy}`), evidenceIds: [...evidenceIds] };
}
