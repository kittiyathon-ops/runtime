export interface ComplexitySemanticCompressionInput {
  traceId: string;
  semanticItems: string[];
  evidenceIds: string[];
  preserveCausality: boolean;
}

export interface ComplexitySemanticCompressionReport {
  status: "COMPRESSED" | "REJECTED";
  summary: string;
  originalCount: number;
  compressedCount: number;
  evidenceIds: string[];
  replaySafe: boolean;
}

export class ComplexitySemanticCompression {
  compress(input: ComplexitySemanticCompressionInput): ComplexitySemanticCompressionReport {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.semanticItems.length === 0 || input.evidenceIds.length === 0) throw new Error("complexity_semantic_compression_requires_lineage");
    if (!input.preserveCausality) {
      return {
        status: "REJECTED",
        summary: "causality_not_preserved",
        originalCount: input.semanticItems.length,
        compressedCount: input.semanticItems.length,
        evidenceIds: [...input.evidenceIds],
        replaySafe: false
      };
    }
    const unique = Array.from(new Set(input.semanticItems)).sort();
    return {
      status: "COMPRESSED",
      summary: unique.join(" | "),
      originalCount: input.semanticItems.length,
      compressedCount: unique.length,
      evidenceIds: [...input.evidenceIds],
      replaySafe: true
    };
  }
}
