import type { Clock } from "../infra/clock.js";
import { fingerprintAlert } from "./alert-deduplicator.js";
import type { StructuredAlertPayload } from "./alert-types.js";
import type { AggregatedAlertPayload } from "./telegram-message-types.js";

export interface AlertAggregationOptions {
  windowMs: number;
  emitThreshold: number;
}

interface AggregateBucket {
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  payload: StructuredAlertPayload;
}

export class AlertAggregator {
  private readonly buckets = new Map<string, AggregateBucket>();

  constructor(private readonly clock: Clock, private readonly options: AlertAggregationOptions) {
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) throw new Error("alert_aggregation_window_invalid");
    if (!Number.isInteger(options.emitThreshold) || options.emitThreshold <= 1) {
      throw new Error("alert_aggregation_threshold_invalid");
    }
  }

  record(payload: StructuredAlertPayload): AggregatedAlertPayload | undefined {
    const now = this.clock.now();
    const fingerprint = fingerprintAlert(payload);
    const bucket = this.buckets.get(fingerprint);
    if (bucket === undefined || now - bucket.firstSeenAt > this.options.windowMs) {
      this.buckets.set(fingerprint, {
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
        payload
      });
      return undefined;
    }

    bucket.count += 1;
    bucket.lastSeenAt = now;
    if (bucket.count < this.options.emitThreshold) return undefined;

    this.buckets.delete(fingerprint);
    return {
      kind: "alert_aggregation",
      severity: payload.severity,
      primaryTag: payload.primaryTag,
      secondaryTags: payload.secondaryTags,
      mode: "compact",
      language: payload.language,
      correlation: payload.correlation,
      fingerprint,
      count: bucket.count,
      windowMs: this.options.windowMs,
      summaryKey: `${payload.kind}:${payload.primaryTag}:${payload.severity}`
    };
  }

  flushExpired(): AggregatedAlertPayload[] {
    const now = this.clock.now();
    const summaries: AggregatedAlertPayload[] = [];
    for (const [fingerprint, bucket] of this.buckets) {
      if (now - bucket.firstSeenAt <= this.options.windowMs || bucket.count <= 1) continue;
      this.buckets.delete(fingerprint);
      summaries.push({
        kind: "alert_aggregation",
        severity: bucket.payload.severity,
        primaryTag: bucket.payload.primaryTag,
        secondaryTags: bucket.payload.secondaryTags,
        mode: "compact",
        language: bucket.payload.language,
        correlation: bucket.payload.correlation,
        fingerprint,
        count: bucket.count,
        windowMs: this.options.windowMs,
        summaryKey: `${bucket.payload.kind}:${bucket.payload.primaryTag}:${bucket.payload.severity}`
      });
    }
    return summaries;
  }
}
