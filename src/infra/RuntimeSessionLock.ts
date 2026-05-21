import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export interface RuntimeSessionLockRecord {
  readonly pid: number;
  readonly sessionId: string;
  readonly startedAt: number;
}

export class RuntimeSessionLock {
  private acquired = false;

  constructor(
    private readonly lockPath: string,
    private readonly record: RuntimeSessionLockRecord
  ) {
    if (lockPath.length === 0) throw new Error("runtime_session_lock_path_required");
    if (record.sessionId.length === 0) throw new Error("runtime_session_id_required");
  }

  acquire(): RuntimeSessionLockRecord {
    if (this.acquired) return this.record;
    mkdirSync(dirname(this.lockPath), { recursive: true });
    if (existsSync(this.lockPath)) {
      const existing = this.readExisting();
      throw new Error(`runtime_session_lock_exists:${existing.pid}:${existing.sessionId}`);
    }
    const fd = openSync(this.lockPath, "wx");
    try {
      writeFileSync(fd, JSON.stringify(this.record));
      this.acquired = true;
      return this.record;
    } finally {
      closeSync(fd);
    }
  }

  release(): void {
    if (!this.acquired) return;
    const existing = this.readExisting();
    if (existing.sessionId !== this.record.sessionId || existing.pid !== this.record.pid) {
      throw new Error("runtime_session_lock_owner_mismatch");
    }
    unlinkSync(this.lockPath);
    this.acquired = false;
  }

  private readExisting(): RuntimeSessionLockRecord {
    const parsed = JSON.parse(readFileSync(this.lockPath, "utf8")) as Partial<RuntimeSessionLockRecord>;
    if (typeof parsed.pid !== "number" || typeof parsed.sessionId !== "string" || typeof parsed.startedAt !== "number") {
      throw new Error("runtime_session_lock_corrupt");
    }
    return { pid: parsed.pid, sessionId: parsed.sessionId, startedAt: parsed.startedAt };
  }
}
