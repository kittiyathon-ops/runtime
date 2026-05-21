export function governanceImmunity(policyPoisoning: boolean, authorityCapture: boolean, overrideDistortion: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_immunity_requires_evidence");
  const compromised = policyPoisoning || authorityCapture || overrideDistortion;
  return {
    status: compromised ? "GOVERNANCE_IMMUNE_RESPONSE" as const : "GOVERNANCE_CLEAR" as const,
    response: compromised ? "freeze_governance_mutation" as const : "observe" as const,
    policyPoisoning,
    authorityCapture,
    overrideDistortion,
    evidenceIds: [...evidenceIds]
  };
}
