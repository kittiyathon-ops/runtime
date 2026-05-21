export interface RuntimeJustification {
  traceId: string;
  decision: string;
  governanceReason: string;
  causalReason: string;
  confidenceReason: string;
  evidenceIds: string[];
  humanReadable: string;
}

export class RuntimeJustificationBuilder {
  build(input: Omit<RuntimeJustification, "humanReadable">): RuntimeJustification {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.evidenceIds.length === 0) throw new Error("runtime_justification_requires_evidence");
    const humanReadable = [
      `Decision: ${input.decision}.`,
      `Governance: ${input.governanceReason}.`,
      `Causality: ${input.causalReason}.`,
      `Confidence: ${input.confidenceReason}.`
    ].join(" ");
    return Object.freeze({ ...input, evidenceIds: [...input.evidenceIds], humanReadable });
  }
}
