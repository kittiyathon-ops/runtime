import type { RuntimeEvent } from "../core/event.js";
import type { StructuredAlertPayload } from "../notifications/alert-types.js";
import type { RuntimeTimelineEntry } from "./runtime-timeline.js";

export type JournalEntryType =
  | "runtime_event"
  | "risk_event"
  | "execution_intent"
  | "state_transition"
  | "replay_marker"
  | "governance_transition"
  | "timeline_entry"
  | "structured_alert";

export interface JournalEntry {
  journalSeq: number;
  type: JournalEntryType;
  timestamp: number;
  eventSeq?: number;
  checkpointId?: string;
  payload: Record<string, unknown>;
}

export interface JournalCursor {
  journalSeq: number;
}

export interface JournalIntegrityIssue {
  journalSeq: number;
  reason: "duplicate_journal_seq" | "out_of_order_journal_seq" | "missing_journal_seq";
}

export class RuntimeJournal {
  private readonly entries: JournalEntry[] = [];
  private nextSeq = 1;

  append(type: JournalEntryType, timestamp: number, payload: Record<string, unknown>, refs: {
    eventSeq?: number;
    checkpointId?: string;
  } = {}): JournalEntry {
    const entry: JournalEntry = {
      journalSeq: this.nextSeq,
      type,
      timestamp,
      ...(refs.eventSeq === undefined ? {} : { eventSeq: refs.eventSeq }),
      ...(refs.checkpointId === undefined ? {} : { checkpointId: refs.checkpointId }),
      payload
    };
    this.entries.push(entry);
    this.nextSeq += 1;
    return entry;
  }

  appendRuntimeEvent(event: RuntimeEvent): JournalEntry {
    return this.append("runtime_event", event.timestamp, { event }, { eventSeq: event.seq });
  }

  appendStructuredAlert(timestamp: number, alert: StructuredAlertPayload): JournalEntry {
    return this.append("structured_alert", timestamp, { alert });
  }

  appendTimelineEntry(entry: RuntimeTimelineEntry): JournalEntry {
    return this.append("timeline_entry", entry.timestamp, {
      timelineEntry: {
        timelineSeq: entry.timelineSeq,
        timestamp: entry.timestamp,
        ...(entry.sequence === undefined ? {} : { sequence: entry.sequence }),
        severity: entry.severity,
        type: entry.type,
        tags: [...entry.tags],
        ...(entry.correlation === undefined ? {} : { correlation: entry.correlation }),
        summaryKey: entry.summaryKey,
        ...(entry.runtimeState === undefined ? {} : { runtimeState: entry.runtimeState }),
        payload: entry.payload
      }
    }, entry.sequence === undefined ? {} : { eventSeq: entry.sequence });
  }

  readFrom(cursor: JournalCursor, limit: number): JournalEntry[] {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("journal_limit_invalid");
    return this.entries.filter((entry) => entry.journalSeq >= cursor.journalSeq).slice(0, limit);
  }

  validate(entries: readonly JournalEntry[] = this.entries): JournalIntegrityIssue[] {
    const issues: JournalIntegrityIssue[] = [];
    const seen = new Set<number>();
    let previous = 0;
    for (const entry of entries) {
      if (seen.has(entry.journalSeq)) issues.push({ journalSeq: entry.journalSeq, reason: "duplicate_journal_seq" });
      if (entry.journalSeq <= previous) issues.push({ journalSeq: entry.journalSeq, reason: "out_of_order_journal_seq" });
      if (previous > 0 && entry.journalSeq > previous + 1) {
        issues.push({ journalSeq: previous + 1, reason: "missing_journal_seq" });
      }
      seen.add(entry.journalSeq);
      previous = entry.journalSeq;
    }
    return issues;
  }

  all(): readonly JournalEntry[] {
    return this.entries;
  }
}
