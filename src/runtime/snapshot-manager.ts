import type { RuntimeEvent } from "../core/event.js";
import type { PortfolioSnapshot } from "./portfolio-state-engine.js";

export interface RuntimeSnapshotPayload {
  portfolio: PortfolioSnapshot;
  runtimeState?: string;
  governanceState?: string;
}

export interface RuntimeSnapshot {
  version: 1;
  snapshotId: string;
  createdAt: number;
  checkpointSeq: number;
  checksum: string;
  payload: RuntimeSnapshotPayload;
}

export interface SnapshotValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SnapshotStore {
  save(snapshot: RuntimeSnapshot): void;
  latest(): RuntimeSnapshot | undefined;
  all(): readonly RuntimeSnapshot[];
}

export class MemorySnapshotStore implements SnapshotStore {
  private readonly snapshots: RuntimeSnapshot[] = [];

  save(snapshot: RuntimeSnapshot): void {
    this.snapshots.push(snapshot);
  }

  latest(): RuntimeSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  all(): readonly RuntimeSnapshot[] {
    return this.snapshots;
  }
}

export class SnapshotManager {
  constructor(private readonly store: SnapshotStore = new MemorySnapshotStore()) {}

  createSnapshot(payload: RuntimeSnapshotPayload, metadata: { createdAt: number; checkpointSeq: number }): RuntimeSnapshot {
    const snapshotWithoutChecksum = {
      version: 1 as const,
      snapshotId: `snapshot:${metadata.checkpointSeq}:${metadata.createdAt}`,
      createdAt: metadata.createdAt,
      checkpointSeq: metadata.checkpointSeq,
      checksum: "",
      payload
    };
    const snapshot = {
      ...snapshotWithoutChecksum,
      checksum: checksumSnapshot(snapshotWithoutChecksum)
    };
    this.store.save(snapshot);
    return snapshot;
  }

  validate(snapshot: RuntimeSnapshot): SnapshotValidationResult {
    if (snapshot.version !== 1) return { valid: false, reason: "snapshot_version_unsupported" };
    if (!Number.isInteger(snapshot.checkpointSeq) || snapshot.checkpointSeq < 0) {
      return { valid: false, reason: "snapshot_checkpoint_invalid" };
    }
    const expected = checksumSnapshot({ ...snapshot, checksum: "" });
    if (snapshot.checksum !== expected) return { valid: false, reason: "snapshot_checksum_mismatch" };
    return { valid: true };
  }

  loadLatestSnapshot(): RuntimeSnapshot | undefined {
    const snapshot = this.store.latest();
    if (snapshot === undefined) return undefined;
    const validation = this.validate(snapshot);
    if (!validation.valid) throw new Error(`snapshot_invalid:${validation.reason ?? "unknown"}`);
    return snapshot;
  }

  all(): readonly RuntimeSnapshot[] {
    return this.store.all();
  }
}

export function checksumSnapshot(snapshot: Omit<RuntimeSnapshot, "checksum"> | RuntimeSnapshot): string {
  const normalized = stableStringify({ ...snapshot, checksum: "" });
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface SnapshotReplaySource {
  readAfter(seq: number, limit: number): RuntimeEvent[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

