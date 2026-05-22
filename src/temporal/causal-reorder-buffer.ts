import type { EventInput } from "../core/event.js";

export interface CausalReorderBufferResult {
  ready: EventInput[];
  uncertainty: CausalUncertainty[];
}

export interface CausalUncertainty {
  eventId: string;
  reason: "missing_exchange_time" | "missing_sequence_after_window" | "time_reversal";
}

export class CausalReorderBuffer {
  private readonly buffer: EventInput[] = [];
  private lastExchangeTimestamp = -1;
  private lastSequenceId: number | undefined;

  constructor(private readonly maxReorderWindowMs: number) {
    if (!Number.isInteger(maxReorderWindowMs) || maxReorderWindowMs < 0) {
      throw new Error("max_reorder_window_invalid");
    }
  }

  push(event: EventInput, nowMonotonicMs: number): CausalReorderBufferResult {
    this.buffer.push(event);
    return this.drain(nowMonotonicMs);
  }

  drain(nowMonotonicMs: number): CausalReorderBufferResult {
    const uncertainty: CausalUncertainty[] = [];
    const ready: EventInput[] = [];
    const retained: EventInput[] = [];

    this.buffer.sort(compareCausalEvent);
    for (const event of this.buffer) {
      const exchangeTimestamp = event.exchangeTimestamp;
      if (exchangeTimestamp === undefined) {
        uncertainty.push({ eventId: eventIdentity(event), reason: "missing_exchange_time" });
        ready.push(event);
        continue;
      }

      const age = nowMonotonicMs - receivedMonotonicMs(event);
      if (age < this.maxReorderWindowMs) {
        retained.push(event);
        continue;
      }

      const sequenceId = sequenceIdOf(event);
      if (sequenceId === undefined && this.lastSequenceId !== undefined) {
        uncertainty.push({ eventId: eventIdentity(event), reason: "missing_sequence_after_window" });
      }
      if (exchangeTimestamp < this.lastExchangeTimestamp) {
        uncertainty.push({ eventId: eventIdentity(event), reason: "time_reversal" });
      }
      ready.push(event);
      this.lastExchangeTimestamp = Math.max(this.lastExchangeTimestamp, exchangeTimestamp);
      if (sequenceId !== undefined) this.lastSequenceId = Math.max(this.lastSequenceId ?? sequenceId, sequenceId);
    }

    this.buffer.length = 0;
    this.buffer.push(...retained);
    return { ready, uncertainty };
  }
}

function compareCausalEvent(left: EventInput, right: EventInput): number {
  const leftTime = left.exchangeTimestamp ?? left.timestamp ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.exchangeTimestamp ?? right.timestamp ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const leftSequence = sequenceIdOf(left) ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = sequenceIdOf(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  return eventIdentity(left).localeCompare(eventIdentity(right));
}

function sequenceIdOf(event: EventInput): number | undefined {
  const value = event.payload.sequenceId ?? event.payload.sequence_id ?? event.payload.updateId ?? event.payload.tradeId;
  const sequenceId = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(sequenceId) && sequenceId >= 0 ? sequenceId : undefined;
}

function receivedMonotonicMs(event: EventInput): number {
  const value = event.payload.received_time_monotonic_ms ?? event.receiveTimestamp ?? event.timestamp ?? 0;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function eventIdentity(event: EventInput): string {
  return event.eventId ?? `${event.source}:${event.eventType}:${event.symbol}:${event.correlationId}`;
}
