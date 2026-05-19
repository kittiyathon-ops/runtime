import type { RuntimeEvent } from "../core/event.js";
import { SequenceGuard } from "../core/sequence.js";

export interface ReplayMismatch {
  seq: number;
  reason: string;
}

export class ReplayEngine {
  verify(events: RuntimeEvent[]): ReplayMismatch[] {
    const guard = new SequenceGuard();
    const mismatches: ReplayMismatch[] = [];
    for (const event of events) {
      const result = guard.accept(event.seq);
      if (result !== "ok") {
        mismatches.push({ seq: event.seq, reason: result });
      }
    }
    return mismatches;
  }
}
