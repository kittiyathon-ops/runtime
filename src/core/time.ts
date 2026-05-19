import type { Clock } from "./clock.js";

export interface TimeEnvelope {
  exchangeTimestamp?: number;
  receiveTimestamp: number;
  processingTimestamp: number;
  monotonicStartMs: number;
}

export function captureTime(clock: Clock, exchangeTimestamp?: number): TimeEnvelope {
  const receiveTimestamp = clock.nowMs();
  return {
    receiveTimestamp,
    processingTimestamp: receiveTimestamp,
    monotonicStartMs: clock.monotonicMs(),
    ...(exchangeTimestamp === undefined ? {} : { exchangeTimestamp })
  };
}
