export interface ExplainabilityViewInput {
  traceId: string;
  subjectId: string;
  policyId: string;
  decision: string;
  reason: string;
  evidenceIds: string[];
  confidenceExplanation: string[];
}

export interface ExplainabilityView {
  traceId: string;
  subjectId: string;
  policyId: string;
  decision: string;
  reason: string;
  evidenceIds: string[];
  confidenceExplanation: string[];
  replayConsistent: true;
}

export class ExplainabilityViewBuilder {
  build(input: ExplainabilityViewInput): ExplainabilityView {
    if (input.traceId.length === 0 || input.policyId.length === 0) throw new Error("explainability_identity_required");
    if (input.evidenceIds.length === 0) throw new Error("explainability_requires_evidence");
    if (input.confidenceExplanation.length === 0) throw new Error("explainability_requires_confidence_explanation");
    return Object.freeze({ ...input, replayConsistent: true as const });
  }
}
