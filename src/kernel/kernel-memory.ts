export class KernelMemory {
  private readonly records: Array<{ seq: number; artifactId: string; evidenceIds: string[] }> = [];
  append(artifactId: string, evidenceIds: string[]) {
    if (artifactId.length === 0 || evidenceIds.length === 0) throw new Error("kernel_memory_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, artifactId, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }
  all() { return this.records; }
}
