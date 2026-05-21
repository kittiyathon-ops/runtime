export interface OrderedEvent {
  id: string;
  seq: number;
  timestamp: number;
  causationSeq?: number;
}

export interface CausalOrderIssue {
  id: string;
  reason: "out_of_order_sequence" | "time_reversal" | "future_cause";
}

export class CausalOrderValidator {
  validate(events: readonly OrderedEvent[]): CausalOrderIssue[] {
    const issues: CausalOrderIssue[] = [];
    let previousSeq = -1;
    let previousTimestamp = -1;
    for (const event of events) {
      if (event.seq <= previousSeq) issues.push({ id: event.id, reason: "out_of_order_sequence" });
      if (event.timestamp < previousTimestamp) issues.push({ id: event.id, reason: "time_reversal" });
      if (event.causationSeq !== undefined && event.causationSeq > event.seq) issues.push({ id: event.id, reason: "future_cause" });
      previousSeq = event.seq;
      previousTimestamp = event.timestamp;
    }
    return issues;
  }
}
