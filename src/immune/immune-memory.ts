export class ImmuneMemory {
  private readonly patterns: string[] = [];

  remember(pattern: string, evidenceIds: string[]) {
    if (pattern.length === 0 || evidenceIds.length === 0) throw new Error("immune_memory_requires_evidence");
    if (!this.patterns.includes(pattern)) this.patterns.push(pattern);
    return { pattern, evidenceIds: [...evidenceIds], memorySize: this.patterns.length };
  }

  recognizes(pattern: string): boolean {
    return this.patterns.includes(pattern);
  }
}
