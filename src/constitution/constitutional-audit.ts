import type { ConstitutionalBreach } from "./constitutional-breach.js";

export interface ConstitutionalAuditRecord {
  auditSeq: number;
  timestamp: number;
  traceId: string;
  action: "validation_passed" | "validation_failed" | "breach_recorded";
  subjectId: string;
  evidenceIds: string[];
  breach?: ConstitutionalBreach;
}

export class ConstitutionalAuditLog {
  private readonly records: ConstitutionalAuditRecord[] = [];
  private nextSeq = 1;

  append(input: Omit<ConstitutionalAuditRecord, "auditSeq"> & { auditSeq?: number }): ConstitutionalAuditRecord {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if ((input.action === "validation_failed" || input.action === "breach_recorded") && input.evidenceIds.length === 0) {
      throw new Error("constitutional_audit_requires_evidence");
    }
    const record = Object.freeze({ ...input, auditSeq: input.auditSeq ?? this.nextSeq });
    if (record.auditSeq !== this.nextSeq) throw new Error(`constitutional_audit_seq_not_append_only:${record.auditSeq}`);
    this.records.push(record);
    this.nextSeq += 1;
    return record;
  }

  all(): readonly ConstitutionalAuditRecord[] {
    return this.records;
  }
}
