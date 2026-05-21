export function finalGovernanceState(policyIds: readonly string[], finalDecisionId: string, legitimate: boolean, evidenceIds: string[]) {
  if (policyIds.length === 0 || finalDecisionId.length === 0 || evidenceIds.length === 0) throw new Error("final_governance_state_requires_evidence");
  return {
    status: legitimate ? "FINAL_GOVERNANCE_LEGITIMATE" as const : "FINAL_GOVERNANCE_FAILED" as const,
    policyIds: [...policyIds].sort(),
    finalDecisionId,
    authorityTerminated: !legitimate,
    evidenceIds: [...evidenceIds]
  };
}
