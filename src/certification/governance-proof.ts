export function certificationGovernanceProof(continuous: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("certification_governance_proof_requires_evidence");
  return { domain: "governance" as const, status: continuous ? "PROVEN" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
