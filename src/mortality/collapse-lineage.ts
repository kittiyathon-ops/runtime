export class CollapseLineage {
  private readonly records: Array<{ seq: number; phase: string; cause: string; evidenceIds: string[] }> = [];

  append(phase: string, cause: string, evidenceIds: string[]) {
    if (phase.length === 0 || cause.length === 0 || evidenceIds.length === 0) throw new Error("collapse_lineage_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, phase, cause, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }

  all() {
    return this.records;
  }
}
