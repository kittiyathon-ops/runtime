export type OverrideSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface OperatorOverrideRecord {
  overrideId: string;
  operatorId: string;
  secondaryOperatorId?: string;
  severity: OverrideSeverity;
  action: string;
  reason: string;
  timestamp: number;
  evidenceIds: readonly string[];
}

export interface OverrideLedgerConfig {
  quotaPer24h: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export class OperatorOverrideLedger {
  private readonly records: OperatorOverrideRecord[] = [];

  constructor(private readonly config: OverrideLedgerConfig) {
    if (!Number.isInteger(config.quotaPer24h) || config.quotaPer24h <= 0) {
      throw new Error("operator_override_quota_invalid");
    }
  }

  append(record: OperatorOverrideRecord): OperatorOverrideRecord {
    this.validate(record);
    if (this.countRecent(record.operatorId, record.timestamp) >= this.config.quotaPer24h) {
      throw new Error("operator_override_quota_exceeded");
    }
    const immutable = Object.freeze({ ...record, evidenceIds: Object.freeze([...record.evidenceIds]) });
    this.records.push(immutable);
    return immutable;
  }

  all(): readonly OperatorOverrideRecord[] {
    return this.records;
  }

  private validate(record: OperatorOverrideRecord): void {
    if (record.overrideId.length === 0) throw new Error("override_id_required");
    if (record.operatorId.length === 0) throw new Error("operator_id_required");
    if (record.action.length === 0) throw new Error("override_action_required");
    if (record.reason.length === 0) throw new Error("override_reason_required");
    if (record.evidenceIds.length === 0) throw new Error("operator_override_requires_evidence");
    if (record.severity === "HIGH" && (record.secondaryOperatorId === undefined || record.secondaryOperatorId === record.operatorId)) {
      throw new Error("high_severity_override_requires_dual_authorization");
    }
  }

  private countRecent(operatorId: string, now: number): number {
    return this.records.filter((record) => record.operatorId === operatorId && now - record.timestamp < DAY_MS).length;
  }
}
