import type { Clock } from "../infra/clock.js";
import type { StructuredAlertPayload } from "./alert-types.js";

export interface AlertDeduplicationOptions {
  ttlMs: number;
  maxSuppressionCount: number;
}

export interface AlertDeduplicationResult {
  accepted: boolean;
  fingerprint: string;
  suppressedCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface DedupEntry {
  firstSeenAt: number;
  lastSeenAt: number;
  suppressedCount: number;
}

export class AlertDeduplicator {
  private readonly entries = new Map<string, DedupEntry>();

  constructor(private readonly clock: Clock, private readonly options: AlertDeduplicationOptions) {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new Error("alert_dedup_ttl_invalid");
    if (!Number.isInteger(options.maxSuppressionCount) || options.maxSuppressionCount < 0) {
      throw new Error("alert_dedup_max_suppression_invalid");
    }
  }

  check(payload: StructuredAlertPayload): AlertDeduplicationResult {
    const now = this.clock.now();
    const fingerprint = fingerprintAlert(payload);
    const existing = this.entries.get(fingerprint);
    if (existing === undefined || now - existing.lastSeenAt > this.options.ttlMs) {
      const entry = { firstSeenAt: now, lastSeenAt: now, suppressedCount: 0 };
      this.entries.set(fingerprint, entry);
      return { accepted: true, fingerprint, ...entry };
    }

    if (existing.suppressedCount < this.options.maxSuppressionCount) {
      existing.suppressedCount += 1;
      existing.lastSeenAt = now;
      return { accepted: false, fingerprint, ...existing };
    }

    const entry = { firstSeenAt: now, lastSeenAt: now, suppressedCount: 0 };
    this.entries.set(fingerprint, entry);
    return { accepted: true, fingerprint, ...entry };
  }

  suppressedCount(fingerprint: string): number {
    return this.entries.get(fingerprint)?.suppressedCount ?? 0;
  }

  prune(): void {
    const now = this.clock.now();
    for (const [fingerprint, entry] of this.entries) {
      if (now - entry.lastSeenAt > this.options.ttlMs) {
        this.entries.delete(fingerprint);
      }
    }
  }
}

export function fingerprintAlert(payload: StructuredAlertPayload): string {
  const record = payload as unknown as Record<string, unknown>;
  return [
    payload.kind,
    payload.severity,
    payload.primaryTag,
    String(record.symbol ?? ""),
    String(record.source ?? ""),
    normalizeFingerprintPart(String(record.reason ?? record.profile ?? record.value ?? ""))
  ].join("|");
}

function normalizeFingerprintPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}
