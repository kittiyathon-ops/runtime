export class CertificationAudit {
  private readonly records: Array<{ seq: number; domain: string; status: string; evidenceIds: string[] }> = [];
  append(domain: string, status: string, evidenceIds: string[]) {
    if (domain.length === 0 || status.length === 0 || evidenceIds.length === 0) throw new Error("certification_audit_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, domain, status, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }
  all() { return this.records; }
}
