import type { RuntimeEvent } from "../core/event.js";

export interface EventCursor {
  seq: number;
  offset: number;
}

export interface ReplaySource {
  read(cursor: EventCursor, limit: number): Promise<RuntimeEvent[]> | RuntimeEvent[];
}

export interface EventSource extends ReplaySource {
  readonly id: string;
}

export class MemoryEventSource implements EventSource {
  readonly id = "memory";

  constructor(private readonly events: readonly RuntimeEvent[]) {}

  read(cursor: EventCursor, limit: number): RuntimeEvent[] {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("event_source_limit_invalid");
    return this.events
      .filter((event) => event.seq >= cursor.seq)
      .slice(cursor.offset, cursor.offset + limit);
  }
}
