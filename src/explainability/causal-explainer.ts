import type { EvidenceChain } from "./evidence-chain.js";

export interface CausalExplanation {
  explanationId: string;
  traceId: string;
  decision: string;
  cause: string;
  effect: string;
  evidenceChain: EvidenceChain;
  humanReadable: string;
}

export class CausalExplainer {
  explain(input: Omit<CausalExplanation, "humanReadable">): CausalExplanation {
    if (input.evidenceChain.steps.length === 0) throw new Error("causal_explanation_requires_evidence");
    const humanReadable = `${input.decision}: ${input.cause} caused ${input.effect} using ${input.evidenceChain.steps.length} evidence step(s).`;
    return Object.freeze({ ...input, humanReadable });
  }
}
