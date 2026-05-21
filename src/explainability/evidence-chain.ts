export interface EvidenceChainStep {
  evidenceId: string;
  timestamp: number;
  source: string;
  summary: string;
}

export interface EvidenceChain {
  chainId: string;
  traceId: string;
  steps: EvidenceChainStep[];
}

export class EvidenceChainBuilder {
  build(chainId: string, traceId: string, steps: readonly EvidenceChainStep[]): EvidenceChain {
    if (chainId.length === 0 || traceId.length === 0) throw new Error("evidence_chain_identity_required");
    if (steps.length === 0) throw new Error("evidence_chain_requires_steps");
    const ordered = [...steps].sort((left, right) => left.timestamp - right.timestamp || left.evidenceId.localeCompare(right.evidenceId));
    return Object.freeze({ chainId, traceId, steps: ordered.map((step) => Object.freeze({ ...step })) });
  }
}
