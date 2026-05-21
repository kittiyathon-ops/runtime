import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database, { type Database as BetterSqliteDatabase, type Statement } from "better-sqlite3";
import type { RuntimeEvent } from "../core/event.js";
import { RuntimeEventSchema } from "../core/event.js";
import type { EventStore } from "./event-store.js";

export class SqliteEventStore implements EventStore {
  private readonly db: BetterSqliteDatabase;
  private readonly pending: RuntimeEvent[] = [];
  private readonly insertEvent: Statement;
  private readonly flushTransaction: (events: RuntimeEvent[]) => void;
  private readonly maxBufferedEvents: number;

  constructor(path: string, options: { maxBufferedEvents?: number } = {}) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = Database(path);
    this.maxBufferedEvents = options.maxBufferedEvents ?? 1_000;
    if (!Number.isInteger(this.maxBufferedEvents) || this.maxBufferedEvents <= 0) throw new Error("sqlite_event_buffer_limit_invalid");
    this.db.exec(`
      create table if not exists events (
        seq integer primary key,
        timestamp integer not null,
        event_type text not null,
        symbol text not null,
        correlation_id text not null,
        causation_id text not null,
        event_json text not null
      );
      create index if not exists idx_events_correlation on events(correlation_id);
    `);
    this.insertEvent = this.db.prepare(`
      insert into events(seq, timestamp, event_type, symbol, correlation_id, causation_id, event_json)
      values (?, ?, ?, ?, ?, ?, ?)
    `);
    this.flushTransaction = this.db.transaction((events: RuntimeEvent[]) => {
      for (const event of events) {
        this.insertEvent.run(
          event.seq,
          event.timestamp,
          event.eventType,
          event.symbol,
          event.correlationId,
          event.causationId,
          JSON.stringify(event)
        );
      }
    }) as (events: RuntimeEvent[]) => void;
  }

  append(event: RuntimeEvent): void {
    if (this.pending.length >= this.maxBufferedEvents) throw new Error("sqlite_event_buffer_full");
    this.pending.push(event);
  }

  flush(): void {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0);
    this.flushTransaction(batch);
  }

  readFrom(seq: number, limit: number): RuntimeEvent[] {
    this.flush();
    const rows = this.db.prepare(`
      select event_json as eventJson from events
      where seq >= ?
      order by seq asc
      limit ?
    `).all(seq, limit) as Array<{ eventJson: string }>;
    return rows.map((row) => RuntimeEventSchema.parse(JSON.parse(row.eventJson)));
  }

  close(): void {
    this.flush();
    this.db.close();
  }
}
