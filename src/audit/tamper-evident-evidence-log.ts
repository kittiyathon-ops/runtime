import { createHash } from "node:crypto";

export interface EvidenceLogEntry<TRecord = Record<string, unknown>> {
  readonly seq: number;
  readonly timestamp: number;
  readonly recordType: string;
  readonly record: TRecord;
  readonly previousHash: string;
  readonly hash: string;
}

export class TamperEvidentEvidenceLog<TRecord = Record<string, unknown>> {
  private readonly entries: Array<EvidenceLogEntry<TRecord>> = [];

  append(recordType: string, timestamp: number, record: TRecord): EvidenceLogEntry<TRecord> {
    if (recordType.length === 0) throw new Error("evidence_record_type_required");
    if (!Number.isInteger(timestamp) || timestamp < 0) throw new Error("evidence_timestamp_invalid");
    const previousHash = this.entries.at(-1)?.hash ?? "GENESIS";
    const seq = this.entries.length + 1;
    const hash = hashRecord({ seq, timestamp, recordType, record, previousHash });
    const entry = Object.freeze({ seq, timestamp, recordType, record: deepFreeze(record), previousHash, hash });
    this.entries.push(entry);
    return entry;
  }

  all(): readonly EvidenceLogEntry<TRecord>[] {
    return this.entries;
  }

  verify(): boolean {
    let previousHash = "GENESIS";
    for (const entry of this.entries) {
      const expected = hashRecord({
        seq: entry.seq,
        timestamp: entry.timestamp,
        recordType: entry.recordType,
        record: entry.record,
        previousHash
      });
      if (entry.previousHash !== previousHash || entry.hash !== expected) return false;
      previousHash = entry.hash;
    }
    return true;
  }
}

function hashRecord(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    return Object.freeze(value);
  }
  return value;
}
