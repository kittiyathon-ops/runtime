export interface Clock {
  nowMs(): number;
  monotonicMs(): number;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }

  monotonicMs(): number {
    return Number(process.hrtime.bigint() / 1_000_000n);
  }
}
