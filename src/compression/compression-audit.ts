export class CompressionAudit {
  private readonly records: Array<{ seq: number; action: string; evidenceIds: string[] }> = [];
  append(action: string, evidenceIds: string[]) {
    if (action.length === 0 || evidenceIds.length === 0) throw new Error("compression_audit_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, action, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }
}
