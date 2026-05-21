import type { AlertMode } from "../notifications/alert-mode.js";
import { dashboardMetadataForSeverity, type AlertDashboardMetadata } from "../notifications/alert-dashboard-metadata.js";
import type { AlertSeverity } from "../notifications/alert-severity.js";
import type { AlertTag } from "../notifications/alert-tags.js";
import type { StructuredAlertPayload } from "../notifications/alert-types.js";
import type { AlertCorrelation, RuntimeAlertState } from "../notifications/telegram-message-types.js";

export interface RuntimeTimelineEntry {
  timelineSeq: number;
  timestamp: number;
  sequence?: number;
  severity: AlertSeverity;
  type: string;
  tags: AlertTag[];
  correlation?: AlertCorrelation;
  summaryKey: string;
  payload: StructuredAlertPayload;
  runtimeState?: RuntimeAlertState;
  dashboard: AlertDashboardMetadata;
}

export interface RuntimeTimelineCursor {
  timelineSeq: number;
}

export class RuntimeTimeline {
  private readonly entries: RuntimeTimelineEntry[] = [];
  private nextSeq = 1;

  appendAlert(timestamp: number, payload: StructuredAlertPayload): RuntimeTimelineEntry {
    const record = payload as unknown as Record<string, unknown>;
    const entry: RuntimeTimelineEntry = {
      timelineSeq: this.nextSeq,
      timestamp,
      ...(typeof record.seq === "number" ? { sequence: record.seq } : {}),
      severity: payload.severity,
      type: payload.kind,
      tags: [payload.primaryTag, ...(payload.secondaryTags ?? [])],
      ...(payload.correlation === undefined ? {} : { correlation: payload.correlation }),
      summaryKey: this.summaryKey(payload),
      payload,
      ...(typeof record.state === "string" ? { runtimeState: record.state as RuntimeAlertState } : {}),
      dashboard: dashboardMetadataForSeverity(payload.severity, (payload.mode ?? "verbose") as AlertMode)
    };
    this.entries.push(entry);
    this.nextSeq += 1;
    return entry;
  }

  readFrom(cursor: RuntimeTimelineCursor, limit: number): RuntimeTimelineEntry[] {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("timeline_limit_invalid");
    return this.entries.filter((entry) => entry.timelineSeq >= cursor.timelineSeq).slice(0, limit);
  }

  all(): readonly RuntimeTimelineEntry[] {
    return this.entries;
  }

  private summaryKey(payload: StructuredAlertPayload): string {
    const record = payload as unknown as Record<string, unknown>;
    return [
      payload.kind,
      payload.severity,
      payload.primaryTag,
      String(record.symbol ?? ""),
      String(record.reason ?? record.summaryKey ?? "")
    ].filter((part) => part.length > 0).join(":");
  }
}
