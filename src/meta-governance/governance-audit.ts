export interface GovernanceAuditRecord {
  auditSeq: number;
  timestamp: number;
  traceId: string;
  policyId: string;
  action: string;
  evidenceIds: string[];
}

export class GovernanceAudit {
  private readonly records: GovernanceAuditRecord[] = [];
  private nextSeq = 1;

  append(input: Omit<GovernanceAuditRecord, "auditSeq"> & { auditSeq?: number }): GovernanceAuditRecord {
    if (input.traceId.length === 0 || input.policyId.length === 0) throw new Error("governance_audit_identity_required");
    if (input.evidenceIds.length === 0) throw new Error("governance_audit_requires_evidence");
    const record = Object.freeze({ ...input, evidenceIds: [...input.evidenceIds], auditSeq: input.auditSeq ?? this.nextSeq });
    if (record.auditSeq !== this.nextSeq) throw new Error(`governance_audit_seq_not_append_only:${record.auditSeq}`);
    this.records.push(record);
    this.nextSeq += 1;
    return record;
  }

  all(): readonly GovernanceAuditRecord[] {
    return this.records;
  }
}
