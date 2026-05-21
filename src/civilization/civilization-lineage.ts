export class CivilizationLineage {
  private readonly entries: Array<{ seq: number; eventId: string; evidenceIds: string[] }> = [];
  append(eventId: string, evidenceIds: string[]) {
    if (eventId.length === 0 || evidenceIds.length === 0) throw new Error("civilization_lineage_requires_evidence");
    const entry = Object.freeze({ seq: this.entries.length + 1, eventId, evidenceIds: [...evidenceIds] });
    this.entries.push(entry);
    return entry;
  }
}
