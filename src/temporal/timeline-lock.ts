export interface TimelineLockRecord {
  lockId: string;
  traceId: string;
  lockedAtSeq: number;
  reason: string;
}

export class TimelineLock {
  private active: TimelineLockRecord | undefined;

  acquire(record: TimelineLockRecord): TimelineLockRecord {
    if (this.active !== undefined) throw new Error(`timeline_already_locked:${this.active.lockId}`);
    if (record.traceId.length === 0) throw new Error("trace_id_required");
    this.active = Object.freeze({ ...record });
    return this.active;
  }

  release(lockId: string): void {
    if (this.active?.lockId !== lockId) throw new Error(`timeline_lock_mismatch:${lockId}`);
    this.active = undefined;
  }

  current(): TimelineLockRecord | undefined {
    return this.active;
  }
}
