export class ContinuityLineage {
  private readonly entries: Array<{ seq: number; lineageId: string; evidenceIds: string[] }> = [];
  append(lineageId: string, evidenceIds: string[]) {
    if (lineageId.length === 0 || evidenceIds.length === 0) throw new Error("continuity_lineage_requires_evidence");
    const entry = Object.freeze({ seq: this.entries.length + 1, lineageId, evidenceIds: [...evidenceIds] });
    this.entries.push(entry);
    return entry;
  }
  all() { return this.entries; }
}
