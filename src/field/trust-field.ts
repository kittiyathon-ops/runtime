export interface TrustFieldNode {
  domainId: string;
  trust: number;
  incomingTrust: readonly string[];
  evidenceIds: string[];
}

export function trustField(nodes: readonly TrustFieldNode[], evidenceIds: string[]) {
  if (nodes.length === 0 || evidenceIds.length === 0) throw new Error("trust_field_requires_evidence");
  const evaluated = nodes
    .map((node) => {
      if (node.domainId.length === 0 || node.trust < 0 || node.trust > 1 || node.evidenceIds.length === 0) throw new Error("trust_field_node_requires_evidence");
      return {
        domainId: node.domainId,
        trust: node.trust,
        status: node.trust < 0.4 ? "DECAYED" as const : node.incomingTrust.length > 2 ? "CONCENTRATED" as const : "BOUNDED" as const,
        incomingTrust: [...node.incomingTrust].sort(),
        evidenceIds: [...node.evidenceIds]
      };
    })
    .sort((a, b) => a.domainId.localeCompare(b.domainId));
  const averageTrust = evaluated.reduce((sum, node) => sum + node.trust, 0) / evaluated.length;
  const fragmented = averageTrust < 0.5 || evaluated.some((node) => node.status === "DECAYED");
  return { status: fragmented ? "TRUST_FRAGMENTED" as const : "TRUST_STABLE" as const, averageTrust, nodes: evaluated, evidenceIds: [...evidenceIds] };
}
