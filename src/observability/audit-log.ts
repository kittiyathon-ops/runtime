import { z } from "zod";
import { TraceContextSchema, type TraceContext } from "./tracing-span.js";

export const ObservabilityAuditActionSchema = z.enum([
  "governance_action",
  "trust_score_changed",
  "degradation_event",
  "quarantine_action",
  "runtime_decision",
  "rollback_action"
]);

export type ObservabilityAuditAction = z.infer<typeof ObservabilityAuditActionSchema>;

export const ObservabilityAuditRecordSchema = z.object({
  auditSeq: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  action: ObservabilityAuditActionSchema,
  trace: TraceContextSchema,
  subjectId: z.string().min(1),
  policyId: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  state: z.record(z.string(), z.unknown())
}).refine((record) =>
  record.action !== "degradation_event" && record.action !== "quarantine_action" || record.evidenceIds.length > 0,
  "degradation_or_quarantine_requires_evidence_lineage");

export type ObservabilityAuditRecord = z.infer<typeof ObservabilityAuditRecordSchema>;

export interface AppendAuditRecordInput extends Omit<ObservabilityAuditRecord, "auditSeq"> {
  auditSeq?: number;
}

export class ObservabilityAuditLog {
  private readonly records: ObservabilityAuditRecord[] = [];
  private nextSeq = 1;

  append(input: AppendAuditRecordInput): ObservabilityAuditRecord {
    const record = Object.freeze(ObservabilityAuditRecordSchema.parse({
      ...input,
      auditSeq: input.auditSeq ?? this.nextSeq
    }));
    if (record.auditSeq !== this.nextSeq) throw new Error(`audit_seq_not_append_only:${record.auditSeq}`);
    this.records.push(record);
    this.nextSeq += 1;
    return record;
  }

  governanceAction(input: {
    timestamp: number;
    trace: TraceContext;
    subjectId: string;
    policyId: string;
    reason: string;
    evidenceIds?: string[];
    state: Record<string, unknown>;
  }): ObservabilityAuditRecord {
    return this.append({ ...input, action: "governance_action", evidenceIds: input.evidenceIds ?? [] });
  }

  all(): readonly ObservabilityAuditRecord[] {
    return this.records;
  }
}
