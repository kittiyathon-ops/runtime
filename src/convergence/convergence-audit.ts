export class ConvergenceAudit {
  private readonly records: Array<{ seq: number; action: string; targetId: string; reversible: boolean; evidenceIds: string[] }> = [];

  append(action: string, targetId: string, reversible: boolean, evidenceIds: string[]) {
    if (action.length === 0 || targetId.length === 0 || evidenceIds.length === 0) throw new Error("convergence_audit_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, action, targetId, reversible, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }

  all() {
    return this.records;
  }
}
