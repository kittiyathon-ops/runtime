export class ExistentialMemory {
  private readonly records: string[] = [];
  remember(recordId: string, evidenceIds: string[]) {
    if (recordId.length === 0 || evidenceIds.length === 0) throw new Error("existential_memory_requires_evidence");
    if (!this.records.includes(recordId)) this.records.push(recordId);
    return { recordId, memorySize: this.records.length, evidenceIds: [...evidenceIds] };
  }
  has(recordId: string): boolean {
    return this.records.includes(recordId);
  }
}
