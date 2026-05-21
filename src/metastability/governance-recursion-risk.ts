export function governanceRecursionRisk(loopDetected: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_recursion_risk_requires_evidence");
  return { status: loopDetected ? "RISK" as const : "CLEAR" as const, evidenceIds: [...evidenceIds] };
}
