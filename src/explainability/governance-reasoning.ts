export interface GovernanceReasoningInput {
  traceId: string;
  policyId: string;
  action: string;
  accepted: boolean;
  reasons: string[];
  evidenceIds: string[];
}

export interface GovernanceReasoning {
  traceId: string;
  policyId: string;
  action: string;
  outcome: "ACCEPTED" | "REJECTED";
  reasons: string[];
  evidenceIds: string[];
  humanReadable: string;
}

export class GovernanceReasoningBuilder {
  build(input: GovernanceReasoningInput): GovernanceReasoning {
    if (input.traceId.length === 0 || input.policyId.length === 0) throw new Error("governance_reasoning_identity_required");
    if (input.reasons.length === 0 || input.evidenceIds.length === 0) throw new Error("governance_reasoning_requires_reasons_and_evidence");
    const outcome = input.accepted ? "ACCEPTED" : "REJECTED";
    return Object.freeze({
      traceId: input.traceId,
      policyId: input.policyId,
      action: input.action,
      outcome,
      reasons: [...input.reasons],
      evidenceIds: [...input.evidenceIds],
      humanReadable: `${outcome}: ${input.action} by ${input.policyId} because ${input.reasons.join("; ")}.`
    });
  }
}
