export interface OperationalRealityLockRecord {
  lockId: string;
  traceId: string;
  lockedAt: number;
  reason: string;
  evidenceIds: string[];
}

export class OperationalRealityLock {
  private active: OperationalRealityLockRecord | undefined;

  freeze(record: OperationalRealityLockRecord): OperationalRealityLockRecord {
    if (this.active !== undefined) throw new Error(`operational_reality_already_locked:${this.active.lockId}`);
    if (record.traceId.length === 0 || record.evidenceIds.length === 0) throw new Error("operational_reality_lock_requires_evidence");
    this.active = Object.freeze({ ...record, evidenceIds: [...record.evidenceIds] });
    return this.active;
  }

  release(lockId: string): void {
    if (this.active?.lockId !== lockId) throw new Error(`operational_reality_lock_mismatch:${lockId}`);
    this.active = undefined;
  }

  current(): OperationalRealityLockRecord | undefined {
    return this.active;
  }
}
