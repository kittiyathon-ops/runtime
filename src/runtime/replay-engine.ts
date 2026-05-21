import type { RuntimeEvent } from "../core/event.js";
import type { Clock } from "../infra/clock.js";
import type { EventCursor, ReplaySource } from "./event-source.js";

export type ReplayMode = "realtime" | "accelerated" | "step";
export type ReplayStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";

export interface ReplayOptions {
  mode: ReplayMode;
  speedMultiplier?: number;
  fromSeq?: number;
}

export interface ReplayCursor {
  nextIndex: number;
  lastSeq: number;
  watermark: number;
}

export interface ReplayCheckpoint {
  cursor: ReplayCursor;
  status: ReplayStatus;
  replayLag: number;
}

export interface ReplayIntegrityIssue {
  seq: number;
  reason: "missing_seq" | "duplicate_seq" | "out_of_order";
}

export interface ReplayResult {
  status: ReplayStatus;
  cursor: ReplayCursor;
  replayLag: number;
  integrityIssues: ReplayIntegrityIssue[];
}

export type ReplayHandler = (event: RuntimeEvent) => Promise<void> | void;

export interface ReplaySourceOptions extends ReplayOptions {
  cursor: EventCursor;
  batchSize: number;
}

export class RuntimeReplayEngine {
  private status: ReplayStatus = "IDLE";
  private cursor: ReplayCursor = { nextIndex: 0, lastSeq: 0, watermark: 0 };
  private readonly seenSeq = new Set<number>();

  constructor(private readonly clock: Clock) {}

  pause(): void {
    if (this.status === "RUNNING") this.status = "PAUSED";
  }

  resume(): void {
    if (this.status === "PAUSED") this.status = "RUNNING";
  }

  checkpoint(totalEvents = 0): ReplayCheckpoint {
    return {
      cursor: { ...this.cursor },
      status: this.status,
      replayLag: Math.max(0, totalEvents - this.cursor.nextIndex)
    };
  }

  validate(events: RuntimeEvent[]): ReplayIntegrityIssue[] {
    const issues: ReplayIntegrityIssue[] = [];
    const seen = new Set<number>();
    let previousSeq = 0;
    for (const event of events) {
      if (seen.has(event.seq)) {
        issues.push({ seq: event.seq, reason: "duplicate_seq" });
      }
      if (event.seq < previousSeq) {
        issues.push({ seq: event.seq, reason: "out_of_order" });
      }
      if (previousSeq > 0 && event.seq > previousSeq + 1) {
        issues.push({ seq: previousSeq + 1, reason: "missing_seq" });
      }
      seen.add(event.seq);
      previousSeq = event.seq;
    }
    return issues;
  }

  async replay(events: RuntimeEvent[], handler: ReplayHandler, options: ReplayOptions): Promise<ReplayResult> {
    const integrityIssues = this.validate(events);
    if (integrityIssues.length > 0) {
      this.status = "FAILED";
      return this.result(events, integrityIssues);
    }

    this.status = "RUNNING";
    this.cursor = {
      nextIndex: this.findStartIndex(events, options.fromSeq ?? 1),
      lastSeq: (options.fromSeq ?? 1) - 1,
      watermark: this.clock.now()
    };
    this.seenSeq.clear();

    while (this.cursor.nextIndex < events.length) {
      if (this.isPaused()) break;
      const event = events[this.cursor.nextIndex];
      if (event === undefined) break;
      if (this.seenSeq.has(event.seq) || event.seq <= this.cursor.lastSeq) {
        this.status = "FAILED";
        return this.result(events, [{ seq: event.seq, reason: this.seenSeq.has(event.seq) ? "duplicate_seq" : "out_of_order" }]);
      }
      await this.waitForReplayTime(events, event, options);
      await handler(event);
      this.seenSeq.add(event.seq);
      this.cursor.lastSeq = event.seq;
      this.cursor.nextIndex += 1;
      this.cursor.watermark = event.timestamp;
      if (options.mode === "step") {
        this.status = this.cursor.nextIndex >= events.length ? "COMPLETED" : "PAUSED";
        return this.result(events, []);
      }
    }

    if (this.cursor.nextIndex >= events.length) this.status = "COMPLETED";
    return this.result(events, []);
  }

  async replayFromSource(source: ReplaySource, handler: ReplayHandler, options: ReplaySourceOptions): Promise<ReplayResult> {
    const events: RuntimeEvent[] = [];
    let cursor = options.cursor;
    while (true) {
      const batch = await source.read(cursor, options.batchSize);
      if (batch.length === 0) break;
      events.push(...batch);
      const last = batch[batch.length - 1];
      if (last === undefined) break;
      cursor = { seq: last.seq + 1, offset: 0 };
      if (batch.length < options.batchSize) break;
    }
    return this.replay(events, handler, options);
  }

  private async waitForReplayTime(events: RuntimeEvent[], event: RuntimeEvent, options: ReplayOptions): Promise<void> {
    if (options.mode === "step") return;
    const previous = events[this.cursor.nextIndex - 1];
    if (previous === undefined) return;
    const delta = Math.max(0, event.timestamp - previous.timestamp);
    if (delta === 0) return;
    const multiplier = options.mode === "accelerated" ? Math.max(1, options.speedMultiplier ?? 1) : 1;
    await this.clock.sleep(Math.floor(delta / multiplier));
  }

  private isPaused(): boolean {
    return (this.status as ReplayStatus) === "PAUSED";
  }

  private findStartIndex(events: RuntimeEvent[], fromSeq: number): number {
    const index = events.findIndex((event) => event.seq >= fromSeq);
    return index === -1 ? events.length : index;
  }

  private result(events: RuntimeEvent[], integrityIssues: ReplayIntegrityIssue[]): ReplayResult {
    return {
      status: this.status,
      cursor: { ...this.cursor },
      replayLag: Math.max(0, events.length - this.cursor.nextIndex),
      integrityIssues
    };
  }
}
