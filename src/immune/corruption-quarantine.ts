export class CorruptionQuarantine {
  private readonly quarantined = new Map<string, { reason: string; evidenceIds: string[] }>();

  quarantine(subjectId: string, reason: string, evidenceIds: string[]) {
    if (subjectId.length === 0 || evidenceIds.length === 0) throw new Error("corruption_quarantine_requires_evidence");
    const record = Object.freeze({ reason, evidenceIds: [...evidenceIds] });
    this.quarantined.set(subjectId, record);
    return { subjectId, ...record, status: "QUARANTINED" as const };
  }

  current(subjectId: string) {
    return this.quarantined.get(subjectId);
  }
}
