import type { RuntimeEvent } from "../core/event.js";
import { PortfolioReconstructionEngine } from "./portfolio-reconstruction-engine.js";
import { PortfolioStateEngine, type PortfolioSnapshot } from "./portfolio-state-engine.js";
import { SnapshotManager, type RuntimeSnapshot } from "./snapshot-manager.js";

export type RecoveryMode =
  | "clean_recovery"
  | "snapshot_recovery"
  | "journal_replay_recovery"
  | "partial_corruption_detected"
  | "manual_intervention_required";

export interface RecoveryReport {
  mode: RecoveryMode;
  status: "OK" | "FAILED_CLOSED";
  checkpointSeq: number;
  replayedEvents: number;
  snapshot?: RuntimeSnapshot;
  portfolio?: PortfolioSnapshot;
  reason?: string;
}

export interface RecoveryEventSource {
  readAfter(seq: number, limit: number): RuntimeEvent[];
}

export class RecoveryManager {
  constructor(
    private readonly snapshots: SnapshotManager,
    private readonly source: RecoveryEventSource,
    private readonly reconstruction = new PortfolioReconstructionEngine()
  ) {}

  recover(limit = 100_000): RecoveryReport {
    let snapshot: RuntimeSnapshot | undefined;
    try {
      snapshot = this.snapshots.loadLatestSnapshot();
    } catch (error) {
      return {
        mode: "partial_corruption_detected",
        status: "FAILED_CLOSED",
        checkpointSeq: 0,
        replayedEvents: 0,
        reason: error instanceof Error ? error.message : "snapshot_corrupt"
      };
    }

    if (snapshot === undefined) {
      const events = this.source.readAfter(0, limit);
      const result = this.reconstruction.reconstruct(events);
      if (result.status === "FAILED") {
        return {
          mode: "manual_intervention_required",
          status: "FAILED_CLOSED",
          checkpointSeq: 0,
          replayedEvents: result.appliedEvents,
          reason: "journal_replay_failed"
        };
      }
      return {
        mode: events.length === 0 ? "clean_recovery" : "journal_replay_recovery",
        status: "OK",
        checkpointSeq: 0,
        replayedEvents: result.appliedEvents,
        portfolio: result.snapshot
      };
    }

    const events = this.source.readAfter(snapshot.checkpointSeq, limit);
    const replay = this.applyAfterSnapshot(snapshot.payload.portfolio, events);
    if (replay.status === "FAILED") {
      return {
        mode: "manual_intervention_required",
        status: "FAILED_CLOSED",
        checkpointSeq: snapshot.checkpointSeq,
        replayedEvents: replay.appliedEvents,
        snapshot,
        reason: replay.reason ?? "post_snapshot_replay_failed"
      };
    }

    return {
      mode: events.length === 0 ? "snapshot_recovery" : "journal_replay_recovery",
      status: "OK",
      checkpointSeq: snapshot.checkpointSeq,
      replayedEvents: replay.appliedEvents,
      snapshot,
      portfolio: events.length === 0 ? snapshot.payload.portfolio : replay.snapshot
    };
  }

  private applyAfterSnapshot(snapshot: PortfolioSnapshot, events: RuntimeEvent[]): {
    status: "OK" | "FAILED";
    appliedEvents: number;
    snapshot: PortfolioSnapshot;
    reason?: string;
  } {
    const engine = new PortfolioStateEngine();
    engine.restore(snapshot);
    let appliedEvents = 0;
    try {
      for (const event of events) {
        engine.apply(event);
        appliedEvents += 1;
      }
      return { status: "OK", appliedEvents, snapshot: engine.snapshot() };
    } catch (error) {
      return {
        status: "FAILED",
        appliedEvents,
        snapshot: engine.snapshot(),
        reason: error instanceof Error ? error.message : "recovery_replay_failed"
      };
    }
  }
}
