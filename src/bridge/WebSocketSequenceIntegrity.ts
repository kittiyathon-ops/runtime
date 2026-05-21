export type WebSocketSequenceAction = "ACCEPT" | "DUPLICATE" | "QUARANTINE" | "RESYNC_REQUIRED";

export interface WebSocketSequenceDecision {
  readonly action: WebSocketSequenceAction;
  readonly streamId: string;
  readonly updateId: string;
  readonly expectedNext?: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

export class WebSocketSequenceIntegrity {
  private readonly lastUpdateByStream = new Map<string, bigint>();
  private readonly resyncAttemptsByStream = new Map<string, number>();

  constructor(private readonly maxResyncAttempts: number) {
    if (!Number.isInteger(maxResyncAttempts) || maxResyncAttempts < 0) throw new Error("max_resync_attempts_invalid");
  }

  observe(streamId: string, updateId: string | number | bigint, evidenceIds: readonly string[]): WebSocketSequenceDecision {
    if (streamId.length === 0) throw new Error("stream_id_required");
    if (evidenceIds.length === 0) throw new Error("websocket_sequence_requires_evidence");
    const current = toUpdateId(updateId);
    const previous = this.lastUpdateByStream.get(streamId);
    if (previous === undefined) {
      this.lastUpdateByStream.set(streamId, current);
      return { action: "ACCEPT", streamId, updateId: current.toString(), reason: "sequence_initialized", evidenceIds: [...evidenceIds] };
    }
    if (current === previous) {
      return { action: "DUPLICATE", streamId, updateId: current.toString(), expectedNext: (previous + 1n).toString(), reason: "duplicate_update_id", evidenceIds: [...evidenceIds] };
    }
    if (current < previous) {
      return { action: "QUARANTINE", streamId, updateId: current.toString(), expectedNext: (previous + 1n).toString(), reason: "out_of_order_update_id", evidenceIds: [...evidenceIds] };
    }
    if (current !== previous + 1n) {
      const attempts = (this.resyncAttemptsByStream.get(streamId) ?? 0) + 1;
      this.resyncAttemptsByStream.set(streamId, attempts);
      return {
        action: attempts > this.maxResyncAttempts ? "QUARANTINE" : "RESYNC_REQUIRED",
        streamId,
        updateId: current.toString(),
        expectedNext: (previous + 1n).toString(),
        reason: "sequence_gap",
        evidenceIds: [...evidenceIds]
      };
    }
    this.lastUpdateByStream.set(streamId, current);
    this.resyncAttemptsByStream.set(streamId, 0);
    return { action: "ACCEPT", streamId, updateId: current.toString(), reason: "sequence_contiguous", evidenceIds: [...evidenceIds] };
  }
}

function toUpdateId(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("update_id_invalid");
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) throw new Error("update_id_invalid");
  return BigInt(value);
}
