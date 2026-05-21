export interface ParallelReality {
  realityId: string;
  confidence: number;
  provenanceIds: string[];
}

export function parallelReality(input: ParallelReality): ParallelReality {
  if (input.realityId.length === 0 || input.provenanceIds.length === 0) throw new Error("parallel_reality_requires_provenance");
  if (input.confidence < 0 || input.confidence > 1) throw new Error("parallel_reality_confidence_invalid");
  return Object.freeze({ ...input, provenanceIds: [...input.provenanceIds] });
}
