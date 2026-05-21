import type { RuntimeEvent } from "../core/event.js";

export interface EventStore {
  append(event: RuntimeEvent): void;
  flush?(): void;
  readFrom(seq: number, limit: number): RuntimeEvent[];
  close(): void;
}
