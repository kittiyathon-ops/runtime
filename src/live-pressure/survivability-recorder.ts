export class SurvivabilityRecorder {
  private readonly records: Array<{ seq: number; durationMs: number; survivabilityScore: number; evidenceIds: string[] }> = [];
  append(durationMs: number, survivabilityScore: number, evidenceIds: string[]) {
    if (durationMs < 0 || survivabilityScore < 0 || evidenceIds.length === 0) throw new Error("survivability_recorder_requires_evidence");
    const record = Object.freeze({ seq: this.records.length + 1, durationMs, survivabilityScore, evidenceIds: [...evidenceIds] });
    this.records.push(record);
    return record;
  }
  all() { return this.records; }
}
