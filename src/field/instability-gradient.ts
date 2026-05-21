export function instabilityGradient(edges: readonly { from: string; to: string; instabilityDelta: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (edges.length === 0 || evidenceIds.length === 0) throw new Error("instability_gradient_requires_evidence");
  const vectors = edges
    .map((edge) => {
      if (edge.from.length === 0 || edge.to.length === 0 || edge.instabilityDelta < 0 || edge.evidenceIds.length === 0) throw new Error("instability_vector_requires_evidence");
      return {
        from: edge.from,
        to: edge.to,
        instabilityDelta: edge.instabilityDelta,
        status: edge.instabilityDelta >= 0.5 ? "SPREADING" as const : "BOUNDED" as const,
        evidenceIds: [...edge.evidenceIds]
      };
    })
    .sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
  return { status: vectors.some((vector) => vector.status === "SPREADING") ? "INSTABILITY_PROPAGATING" as const : "INSTABILITY_BOUNDED" as const, vectors, evidenceIds: [...evidenceIds] };
}
