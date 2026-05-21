export class ThreatMemory {
  private readonly records: Array<{ seq: number; signature: string; defensePattern: string; survived: boolean; evidenceIds: string[] }> = [];

  append(signature: string, defensePattern: string, survived: boolean, evidenceIds: string[]) {
    if (signature.length === 0 || defensePattern.length === 0 || evidenceIds.length === 0) throw new Error("threat_memory_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, signature, defensePattern, survived, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }

  seen(signature: string) {
    return this.records.filter((record) => record.signature === signature);
  }

  all() {
    return this.records;
  }
}
