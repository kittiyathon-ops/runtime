import type { RuntimeEvent } from "../core/event.js";

export interface EventStore {
  append(event: RuntimeEvent): void;
  readFrom(seq: number, limit: number): RuntimeEvent[];
  close(): void;
}
