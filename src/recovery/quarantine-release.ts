export type QuarantineReleaseStatus = "QUARANTINED" | "PENDING_MANUAL_REVIEW" | "RELEASED";

export interface QuarantineRecord {
  sourceId: string;
  quarantinedAt: number;
  traceId: string;
  evidenceIds: string[];
  reason: string;
  status: QuarantineReleaseStatus;
  reviewedBy?: string;
  releasedAt?: number;
}

export class QuarantineReleaseProtocol {
  private readonly records = new Map<string, QuarantineRecord>();

  quarantine(input: Omit<QuarantineRecord, "status">): QuarantineRecord {
    if (input.evidenceIds.length === 0) throw new Error("quarantine_requires_evidence_lineage");
    const record = Object.freeze({ ...input, status: "QUARANTINED" as const });
    this.records.set(input.sourceId, record);
    return record;
  }

  requestManualReview(sourceId: string): QuarantineRecord {
    const record = this.requireRecord(sourceId);
    const reviewed = Object.freeze({ ...record, status: "PENDING_MANUAL_REVIEW" as const });
    this.records.set(sourceId, reviewed);
    return reviewed;
  }

  release(sourceId: string, reviewedBy: string, releasedAt: number): QuarantineRecord {
    if (reviewedBy.length === 0) throw new Error("reviewer_required");
    const record = this.requireRecord(sourceId);
    if (record.status !== "PENDING_MANUAL_REVIEW") throw new Error(`manual_review_required:${sourceId}`);
    const released = Object.freeze({ ...record, status: "RELEASED" as const, reviewedBy, releasedAt });
    this.records.set(sourceId, released);
    return released;
  }

  current(sourceId: string): QuarantineRecord | undefined {
    return this.records.get(sourceId);
  }

  private requireRecord(sourceId: string): QuarantineRecord {
    const record = this.records.get(sourceId);
    if (record === undefined) throw new Error(`quarantine_record_not_found:${sourceId}`);
    return record;
  }
}
