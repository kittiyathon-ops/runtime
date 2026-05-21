export class SemanticLineage {
  private readonly entries: Array<{ seq: number; meaningId: string; evidenceIds: string[] }> = [];
  append(meaningId: string, evidenceIds: string[]) {
    if (meaningId.length === 0 || evidenceIds.length === 0) throw new Error("semantic_lineage_requires_evidence");
    const entry = Object.freeze({ seq: this.entries.length + 1, meaningId, evidenceIds: [...evidenceIds] });
    this.entries.push(entry);
    return entry;
  }
  all() { return this.entries; }
}
