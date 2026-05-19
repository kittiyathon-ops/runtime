import type { RuntimeEvent } from "../core/event.js";
import type { Logger } from "../infra/logger.js";

export interface AuditEntry {
  action: string;
  seq?: number;
  eventType?: string;
  correlationId?: string;
  runtimeProfile?: string;
  symbol?: string;
  expectedPosition?: number;
  actualPosition?: number;
  processingLatencyMs?: number;
  queueDepth?: number;
  replayLag?: number;
  threshold?: number;
  limits?: Record<string, number>;
  reason?: string;
}

export type AuditRecord = RuntimeEvent | AuditEntry;

export interface AuditSink {
  record(record: AuditRecord): void;
}

export class AuditLog implements AuditSink {
  constructor(private readonly logger: Logger) {}

  record(record: AuditRecord): void {
    if ("action" in record) {
      this.logger.info(record, "audit_decision");
      return;
    }

    const event = record;
    this.logger.info({
      seq: event.seq,
      eventType: event.eventType,
      symbol: event.symbol,
      correlationId: event.correlationId,
      causationId: event.causationId
    }, "audit_event");
  }
}
