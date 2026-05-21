import type { RuntimeEvent } from "../core/event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type OperationalMetricKind =
  | "ORDER_REJECTION"
  | "FUNDING_IMPACT"
  | "GOVERNANCE_HALT"
  | "WEBSOCKET_RECONNECT"
  | "STALE_FEED"
  | "SEQUENCE_GAP"
  | "REPLAY_DIVERGENCE";

export interface OperationalMetricRecord {
  readonly seq: number;
  readonly timestamp: number;
  readonly kind: OperationalMetricKind;
  readonly symbol?: string;
  readonly reason?: string;
  readonly durationMs?: number;
  readonly amountUsd?: string;
  readonly evidenceIds: readonly string[];
}

export interface OperationalMetricInput {
  readonly timestamp: number;
  readonly kind: OperationalMetricKind;
  readonly symbol?: string;
  readonly reason?: string;
  readonly durationMs?: number;
  readonly amountUsd?: string;
  readonly evidenceIds: readonly string[];
}

export interface OperationalMetricsSnapshot {
  readonly totalRecords: number;
  readonly retainedRecords: number;
  readonly droppedRecords: number;
  readonly orderRejectionsByReason: Readonly<Record<string, number>>;
  readonly fundingImpactUsdBySymbol: Readonly<Record<string, string>>;
  readonly governanceHaltsByReason: Readonly<Record<string, number>>;
  readonly websocketReconnects: number;
  readonly staleFeedEvents: number;
  readonly staleFeedDurationMs: number;
  readonly sequenceGaps: number;
  readonly replayDivergences: number;
  readonly records: readonly OperationalMetricRecord[];
}

export interface OperationalMetricsRecorderOptions {
  readonly maxRecords?: number;
}

export class OperationalMetricsRecorder {
  private readonly maxRecords: number;
  private readonly records: OperationalMetricRecord[] = [];
  private nextSeq = 1;
  private droppedRecords = 0;

  constructor(options: OperationalMetricsRecorderOptions = {}) {
    this.maxRecords = options.maxRecords ?? 1_000;
    if (!Number.isInteger(this.maxRecords) || this.maxRecords <= 0) throw new Error("operational_metrics_max_records_invalid");
  }

  applyRuntimeEvent(event: RuntimeEvent): readonly OperationalMetricRecord[] {
    const before = this.records.length;
    if (event.eventType === "ORDER_REJECTED") {
      this.record({
        timestamp: event.timestamp,
        kind: "ORDER_REJECTION",
        symbol: event.symbol,
        reason: stringPayload(event, "reason") ?? "order_rejected",
        evidenceIds: [evidenceId(event)]
      });
    }
    if (event.eventType === "EXECUTION_ERROR") {
      this.record({
        timestamp: event.timestamp,
        kind: "ORDER_REJECTION",
        symbol: event.symbol,
        reason: stringPayload(event, "reason") ?? "execution_error",
        evidenceIds: [evidenceId(event)]
      });
    }
    if (event.eventType === "ORDER_FILLED" || event.eventType === "POSITION_UPDATED") {
      const fundingUsd = decimalPayload(event, "fundingUsd") ?? decimalPayload(event, "fundingFeeUsd");
      if (fundingUsd !== undefined && PrecisionMath.safeCompare(fundingUsd, "0") !== 0) {
        this.record({
          timestamp: event.timestamp,
          kind: "FUNDING_IMPACT",
          symbol: event.symbol,
          amountUsd: fundingUsd,
          reason: "funding",
          evidenceIds: [evidenceId(event)]
        });
      }
    }
    if (event.eventType === "SAFE_MODE") {
      const reason = stringPayload(event, "reason") ?? "safe_mode";
      if (reason.includes("governance_halt") || reason.includes("divergence") || reason.includes("replay")) {
        this.record({
          timestamp: event.timestamp,
          kind: "GOVERNANCE_HALT",
          symbol: event.symbol,
          reason,
          evidenceIds: [evidenceId(event)]
        });
      }
    }
    return this.records.slice(before);
  }

  record(input: OperationalMetricInput): OperationalMetricRecord {
    validateInput(input);
    const record: OperationalMetricRecord = {
      seq: this.nextSeq,
      timestamp: input.timestamp,
      kind: input.kind,
      ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      ...(input.amountUsd === undefined ? {} : { amountUsd: PrecisionMath.normalize(input.amountUsd) }),
      evidenceIds: [...input.evidenceIds]
    };
    this.nextSeq += 1;
    this.records.push(record);
    while (this.records.length > this.maxRecords) {
      this.records.shift();
      this.droppedRecords += 1;
    }
    return record;
  }

  snapshot(): OperationalMetricsSnapshot {
    const orderRejectionsByReason: Record<string, number> = {};
    const fundingImpactUsdBySymbol: Record<string, string> = {};
    const governanceHaltsByReason: Record<string, number> = {};
    let websocketReconnects = 0;
    let staleFeedEvents = 0;
    let staleFeedDurationMs = 0;
    let sequenceGaps = 0;
    let replayDivergences = 0;

    for (const record of this.records) {
      if (record.kind === "ORDER_REJECTION") increment(orderRejectionsByReason, record.reason ?? "unknown");
      if (record.kind === "FUNDING_IMPACT") {
        const symbol = record.symbol ?? "UNKNOWN";
        fundingImpactUsdBySymbol[symbol] = PrecisionMath.add(fundingImpactUsdBySymbol[symbol] ?? "0", record.amountUsd ?? "0");
      }
      if (record.kind === "GOVERNANCE_HALT") increment(governanceHaltsByReason, record.reason ?? "unknown");
      if (record.kind === "WEBSOCKET_RECONNECT") websocketReconnects += 1;
      if (record.kind === "STALE_FEED") {
        staleFeedEvents += 1;
        staleFeedDurationMs += record.durationMs ?? 0;
      }
      if (record.kind === "SEQUENCE_GAP") sequenceGaps += 1;
      if (record.kind === "REPLAY_DIVERGENCE") replayDivergences += 1;
    }

    return {
      totalRecords: this.nextSeq - 1,
      retainedRecords: this.records.length,
      droppedRecords: this.droppedRecords,
      orderRejectionsByReason,
      fundingImpactUsdBySymbol,
      governanceHaltsByReason,
      websocketReconnects,
      staleFeedEvents,
      staleFeedDurationMs,
      sequenceGaps,
      replayDivergences,
      records: this.records.map((record) => ({
        ...record,
        evidenceIds: [...record.evidenceIds]
      }))
    };
  }
}

function validateInput(input: OperationalMetricInput): void {
  if (!Number.isInteger(input.timestamp) || input.timestamp < 0) throw new Error("operational_metric_timestamp_invalid");
  if (input.evidenceIds.length === 0) throw new Error("operational_metric_requires_evidence");
  if (input.reason !== undefined && input.reason.length === 0) throw new Error("operational_metric_reason_invalid");
  if (input.symbol !== undefined && input.symbol.length === 0) throw new Error("operational_metric_symbol_invalid");
  if (input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0)) throw new Error("operational_metric_duration_invalid");
  if (input.amountUsd !== undefined) PrecisionMath.assertDecimal(input.amountUsd, "operational_metric_amount_usd");
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function stringPayload(event: RuntimeEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function decimalPayload(event: RuntimeEvent, key: string): string | undefined {
  const value = event.payload[key];
  if (typeof value === "string") return PrecisionMath.assertDecimal(value, key);
  if (typeof value === "number" && Number.isFinite(value)) return PrecisionMath.assertDecimal(String(value), key);
  return undefined;
}

function evidenceId(event: RuntimeEvent): string {
  return event.eventId ?? `${event.eventType}:${event.seq}`;
}
