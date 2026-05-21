export interface SemanticCompressionInput {
  traceId: string;
  subjectId: string;
  statements: string[];
  evidenceIds: string[];
}

export interface SemanticCompression {
  traceId: string;
  subjectId: string;
  summary: string;
  originalCount: number;
  evidenceIds: string[];
  replaySafe: true;
}

export class SemanticCompressor {
  compress(input: SemanticCompressionInput): SemanticCompression {
    if (input.traceId.length === 0 || input.subjectId.length === 0) throw new Error("semantic_compression_identity_required");
    if (input.statements.length === 0 || input.evidenceIds.length === 0) throw new Error("semantic_compression_requires_content");
    const summary = Array.from(new Set(input.statements)).sort().join(" | ");
    return { traceId: input.traceId, subjectId: input.subjectId, summary, originalCount: input.statements.length, evidenceIds: [...input.evidenceIds], replaySafe: true };
  }
}
