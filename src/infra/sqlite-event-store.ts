import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import type { RuntimeEvent } from "../core/event.js";
import { RuntimeEventSchema } from "../core/event.js";
import type { EventStore } from "./event-store.js";

export class SqliteEventStore implements EventStore {
  private readonly db: BetterSqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = Database(path);
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
  }

  append(event: RuntimeEvent): void {
    this.db.prepare(`
      insert into events(seq, timestamp, event_type, symbol, correlation_id, causation_id, event_json)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.seq,
      event.timestamp,
      event.eventType,
      event.symbol,
      event.correlationId,
      event.causationId,
      JSON.stringify(event)
    );
  }

  readFrom(seq: number, limit: number): RuntimeEvent[] {
    const rows = this.db.prepare(`
      select event_json as eventJson from events
      where seq >= ?
      order by seq asc
      limit ?
    `).all(seq, limit) as Array<{ eventJson: string }>;
    return rows.map((row) => RuntimeEventSchema.parse(JSON.parse(row.eventJson)));
  }

  close(): void {
    this.db.close();
  }
}
