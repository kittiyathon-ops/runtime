export class SimplificationAudit {
  private readonly records: Array<{ seq: number; recommendation: string; justification: string; reversible: boolean; evidenceIds: string[] }> = [];

  append(recommendation: string, justification: string, reversible: boolean, evidenceIds: string[]) {
    if (recommendation.length === 0 || justification.length === 0 || evidenceIds.length === 0) throw new Error("simplification_audit_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, recommendation, justification, reversible, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }

  all() {
    return this.records;
  }
}
