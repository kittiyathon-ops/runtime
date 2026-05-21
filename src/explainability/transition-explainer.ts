export interface TransitionExplanation {
  traceId: string;
  from: string;
  to: string;
  safe: boolean;
  reasons: string[];
  evidenceIds: string[];
  humanReadable: string;
}

export class TransitionExplainer {
  explain(input: Omit<TransitionExplanation, "humanReadable">): TransitionExplanation {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.reasons.length === 0 || input.evidenceIds.length === 0) throw new Error("transition_explanation_requires_reason_and_evidence");
    const verdict = input.safe ? "safe" : "unsafe";
    return Object.freeze({ ...input, humanReadable: `Transition ${input.from}->${input.to} was ${verdict}: ${input.reasons.join("; ")}.` });
  }
}
