export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface AdjustableClock extends Clock {
  setTime(ts: number): void;
  advance(ms: number): void;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms < 0) {
      return Promise.reject(new Error("sleep_ms_invalid"));
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class ManualClock implements AdjustableClock {
  constructor(private currentTimeMs = 0) {
    this.assertTimestamp(currentTimeMs);
  }

  now(): number {
    return this.currentTimeMs;
  }

  sleep(ms: number): Promise<void> {
    this.advance(ms);
    return Promise.resolve();
  }

  setTime(ts: number): void {
    this.assertTimestamp(ts);
    this.currentTimeMs = ts;
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error("clock_advance_invalid");
    }
    this.currentTimeMs += ms;
  }

  private assertTimestamp(ts: number): void {
    if (!Number.isFinite(ts) || ts < 0) {
      throw new Error("clock_time_invalid");
    }
  }
}

export class ReplayClock extends ManualClock {}
