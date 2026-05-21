export interface GovernanceProofInput {
  traceId: string;
  policyId: string;
  authorized: boolean;
  constraintsSatisfied: boolean;
  evidenceIds: string[];
}

export interface GovernanceProof {
  status: "PROVEN" | "REJECTED";
  traceId: string;
  policyId: string;
  reason: string;
  evidenceIds: string[];
}

export class GovernanceProofBuilder {
  prove(input: GovernanceProofInput): GovernanceProof {
    if (input.traceId.length === 0 || input.policyId.length === 0) throw new Error("governance_proof_identity_required");
    if ((!input.authorized || !input.constraintsSatisfied) && input.evidenceIds.length === 0) {
      throw new Error("rejected_governance_proof_requires_evidence");
    }
    const status = input.authorized && input.constraintsSatisfied ? "PROVEN" : "REJECTED";
    return {
      status,
      traceId: input.traceId,
      policyId: input.policyId,
      reason: status === "PROVEN" ? "governance_constraints_satisfied" : "governance_constraints_failed",
      evidenceIds: input.evidenceIds
    };
  }
}
