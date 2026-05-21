export interface ConfidenceExplanationInput {
  traceId: string;
  confidence: number;
  degradationWeight: number;
  evidenceIds: string[];
  factors: string[];
}

export interface ConfidenceExplanation {
  traceId: string;
  confidence: number;
  degradationWeight: number;
  effectiveConfidence: number;
  evidenceIds: string[];
  factors: string[];
  humanReadable: string;
}

export class ConfidenceExplainer {
  explain(input: ConfidenceExplanationInput): ConfidenceExplanation {
    if (input.confidence < 0 || input.confidence > 1 || input.degradationWeight < 0 || input.degradationWeight > 1) {
      throw new Error("confidence_explanation_score_invalid");
    }
    if (input.evidenceIds.length === 0 || input.factors.length === 0) throw new Error("confidence_explanation_requires_lineage");
    const effectiveConfidence = input.confidence * (1 - input.degradationWeight);
    return {
      ...input,
      evidenceIds: [...input.evidenceIds],
      factors: [...input.factors],
      effectiveConfidence,
      humanReadable: `Confidence ${input.confidence.toFixed(4)} degraded by ${input.degradationWeight.toFixed(4)} to ${effectiveConfidence.toFixed(4)}.`
    };
  }
}
