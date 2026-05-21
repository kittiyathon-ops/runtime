export interface SemanticTimelineEntry {
  semanticSeq: number;
  timestamp: number;
  traceId: string;
  subjectId: string;
  summary: string;
  evidenceIds: string[];
}

export class SemanticTimeline {
  private readonly entries: SemanticTimelineEntry[] = [];
  private nextSeq = 1;

  append(input: Omit<SemanticTimelineEntry, "semanticSeq"> & { semanticSeq?: number }): SemanticTimelineEntry {
    if (input.traceId.length === 0 || input.subjectId.length === 0) throw new Error("semantic_timeline_identity_required");
    if (input.evidenceIds.length === 0) throw new Error("semantic_timeline_requires_evidence");
    const entry = Object.freeze({ ...input, evidenceIds: [...input.evidenceIds], semanticSeq: input.semanticSeq ?? this.nextSeq });
    if (entry.semanticSeq !== this.nextSeq) throw new Error(`semantic_timeline_seq_not_append_only:${entry.semanticSeq}`);
    this.entries.push(entry);
    this.nextSeq += 1;
    return entry;
  }

  all(): readonly SemanticTimelineEntry[] {
    return this.entries;
  }
}
