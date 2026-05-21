export function governancePoisoning(policyHashChanged: boolean, authorityValid: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("adversarial_governance_poisoning_requires_evidence");
  const contained = !policyHashChanged && authorityValid;
  return { scenarioId: "governance_poisoning", status: contained ? "CONTAINED" as const : "ESCALATED" as const, severity: contained ? 0 : 5, evidenceIds: [...evidenceIds] };
}
