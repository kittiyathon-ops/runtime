import type { RuntimeEvent } from "../core/event.js";
import { PortfolioReconstructionEngine } from "./portfolio-reconstruction-engine.js";
import { PortfolioStateEngine, type PortfolioDivergence, type PortfolioSnapshot } from "./portfolio-state-engine.js";
import { SnapshotManager, type RuntimeSnapshot } from "./snapshot-manager.js";

export type RecoveryResult =
  | "CLEAN_RECOVERY"
  | "SNAPSHOT_RECOVERY"
  | "JOURNAL_REPLAY_RECOVERY"
  | "MANUAL_INTERVENTION_REQUIRED"
  | "RECOVERY_FAILED";

export type RecoveryMode = RecoveryResult;

export interface RecoveryExpectedState {
  readonly positions?: Record<string, number>;
  readonly balances?: Record<string, number>;
  readonly realizedPnlUsd?: number;
  readonly feesUsd?: number;
  readonly fundingUsd?: number;
  readonly requiredFillIds?: readonly string[];
}

export interface RecoveryOptions {
  readonly limit?: number;
  readonly expected?: RecoveryExpectedState;
}

export interface RecoveryReport {
  readonly mode: RecoveryMode;
  readonly result: RecoveryResult;
  readonly status: "OK" | "FAILED_CLOSED";
  readonly checkpointSeq: number;
  readonly replayedEvents: number;
  readonly snapshot?: RuntimeSnapshot;
  readonly portfolio?: PortfolioSnapshot;
  readonly reason?: string;
  readonly replayIntegrityIssues?: readonly RecoveryReplayIntegrityIssue[];
  readonly divergences?: readonly PortfolioDivergence[];
}

export interface RecoveryReplayIntegrityIssue {
  readonly seq: number;
  readonly reason:
    | "duplicate_seq"
    | "missing_seq"
    | "out_of_order"
    | "checkpoint_replay_overlap";
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

  recover(input: number | RecoveryOptions = {}): RecoveryReport {
    const options = typeof input === "number" ? { limit: input } : input;
    const limit = options.limit ?? 100_000;
    let snapshot: RuntimeSnapshot | undefined;
    try {
      snapshot = this.snapshots.loadLatestSnapshot();
    } catch (error) {
      return this.failed("MANUAL_INTERVENTION_REQUIRED", 0, 0, error instanceof Error ? error.message : "snapshot_corrupt");
    }

    if (snapshot === undefined) {
      const events = this.readEvents(0, limit);
      if (events.status === "FAILED") return this.failed("RECOVERY_FAILED", 0, 0, events.reason);

      const integrityIssues = this.validateReplayIntegrity(0, events.events);
      if (integrityIssues.length > 0) {
        return this.failed("MANUAL_INTERVENTION_REQUIRED", 0, 0, "journal_replay_integrity_failed", undefined, undefined, integrityIssues);
      }

      const result = this.reconstruction.reconstruct(events.events, this.reconstructionExpected(options.expected));
      if (result.status === "FAILED") {
        return this.failed("MANUAL_INTERVENTION_REQUIRED", 0, result.appliedEvents, "journal_replay_failed", undefined, result.snapshot, undefined, result.divergenceReport.divergences);
      }
      if (result.status === "DIVERGENT") {
        return this.failed("MANUAL_INTERVENTION_REQUIRED", 0, result.appliedEvents, "expected_state_diverged", undefined, result.snapshot, undefined, result.divergenceReport.divergences);
      }
      return {
        mode: events.events.length === 0 ? "CLEAN_RECOVERY" : "JOURNAL_REPLAY_RECOVERY",
        result: events.events.length === 0 ? "CLEAN_RECOVERY" : "JOURNAL_REPLAY_RECOVERY",
        status: "OK",
        checkpointSeq: 0,
        replayedEvents: result.appliedEvents,
        portfolio: result.snapshot
      };
    }

    const events = this.readEvents(snapshot.checkpointSeq, limit);
    if (events.status === "FAILED") {
      return this.failed("RECOVERY_FAILED", snapshot.checkpointSeq, 0, events.reason, snapshot);
    }

    const integrityIssues = this.validateReplayIntegrity(snapshot.checkpointSeq, events.events);
    if (integrityIssues.length > 0) {
      return this.failed("MANUAL_INTERVENTION_REQUIRED", snapshot.checkpointSeq, 0, "post_snapshot_replay_integrity_failed", snapshot, undefined, integrityIssues);
    }

    const replay = this.applyAfterSnapshot(snapshot.payload.portfolio, events.events, options.expected);
    if (replay.status === "FAILED") {
      return this.failed("MANUAL_INTERVENTION_REQUIRED", snapshot.checkpointSeq, replay.appliedEvents, replay.reason ?? "post_snapshot_replay_failed", snapshot, replay.snapshot, undefined, replay.divergences);
    }
    if (replay.status === "DIVERGENT") {
      return this.failed("MANUAL_INTERVENTION_REQUIRED", snapshot.checkpointSeq, replay.appliedEvents, "expected_state_diverged", snapshot, replay.snapshot, undefined, replay.divergences);
    }

    return {
      mode: events.events.length === 0 ? "SNAPSHOT_RECOVERY" : "JOURNAL_REPLAY_RECOVERY",
      result: events.events.length === 0 ? "SNAPSHOT_RECOVERY" : "JOURNAL_REPLAY_RECOVERY",
      status: "OK",
      checkpointSeq: snapshot.checkpointSeq,
      replayedEvents: replay.appliedEvents,
      snapshot,
      portfolio: replay.snapshot
    };
  }

  private applyAfterSnapshot(snapshot: PortfolioSnapshot, events: RuntimeEvent[], expected: RecoveryExpectedState | undefined): {
    status: "OK" | "DIVERGENT" | "FAILED";
    appliedEvents: number;
    snapshot: PortfolioSnapshot;
    reason?: string;
    divergences?: PortfolioDivergence[];
  } {
    const engine = new PortfolioStateEngine();
    engine.restore(snapshot);
    let appliedEvents = 0;
    try {
      for (const event of events) {
        engine.apply(event);
        appliedEvents += 1;
      }
      const finalSnapshot = engine.snapshot();
      const expectedReport = engine.compareExpected(expected ?? {});
      const missingFillDivergences = this.findMissingFillDivergences(finalSnapshot, expected?.requiredFillIds ?? []);
      const divergences = [...expectedReport.divergences, ...missingFillDivergences];
      if (divergences.length > 0) {
        return { status: "DIVERGENT", appliedEvents, snapshot: finalSnapshot, divergences };
      }
      return { status: "OK", appliedEvents, snapshot: finalSnapshot };
    } catch (error) {
      return {
        status: "FAILED",
        appliedEvents,
        snapshot: engine.snapshot(),
        reason: error instanceof Error ? error.message : "recovery_replay_failed"
      };
    }
  }

  private readEvents(seq: number, limit: number): { status: "OK"; events: RuntimeEvent[] } | { status: "FAILED"; reason: string } {
    try {
      return { status: "OK", events: this.source.readAfter(seq, limit) };
    } catch (error) {
      return { status: "FAILED", reason: error instanceof Error ? error.message : "recovery_event_source_failed" };
    }
  }

  private validateReplayIntegrity(checkpointSeq: number, events: readonly RuntimeEvent[]): RecoveryReplayIntegrityIssue[] {
    const issues: RecoveryReplayIntegrityIssue[] = [];
    const seen = new Set<number>();
    let previousSeq = checkpointSeq;
    for (const event of events) {
      if (event.seq <= checkpointSeq) {
        issues.push({ seq: event.seq, reason: "checkpoint_replay_overlap" });
      }
      if (seen.has(event.seq)) {
        issues.push({ seq: event.seq, reason: "duplicate_seq" });
      }
      if (event.seq < previousSeq) {
        issues.push({ seq: event.seq, reason: "out_of_order" });
      }
      if (event.seq > previousSeq + 1) {
        issues.push({ seq: previousSeq + 1, reason: "missing_seq" });
      }
      seen.add(event.seq);
      previousSeq = event.seq;
    }
    return issues;
  }

  private findMissingFillDivergences(snapshot: PortfolioSnapshot, requiredFillIds: readonly string[]): PortfolioDivergence[] {
    const applied = new Set(snapshot.appliedFillIds);
    return requiredFillIds
      .filter((fillId) => !applied.has(fillId))
      .map((fillId) => ({
        type: "missing_fill",
        eventId: fillId,
        reason: "required_fill_missing"
      }));
  }

  private reconstructionExpected(expected: RecoveryExpectedState | undefined): {
    positions?: Record<string, number>;
    balances?: Record<string, number>;
    realizedPnlUsd?: number;
    feesUsd?: number;
    fundingUsd?: number;
    requiredFillIds?: string[];
  } | undefined {
    if (expected === undefined) return undefined;
    return {
      ...(expected.positions === undefined ? {} : { positions: expected.positions }),
      ...(expected.balances === undefined ? {} : { balances: expected.balances }),
      ...(expected.realizedPnlUsd === undefined ? {} : { realizedPnlUsd: expected.realizedPnlUsd }),
      ...(expected.feesUsd === undefined ? {} : { feesUsd: expected.feesUsd }),
      ...(expected.fundingUsd === undefined ? {} : { fundingUsd: expected.fundingUsd }),
      ...(expected.requiredFillIds === undefined ? {} : { requiredFillIds: [...expected.requiredFillIds] })
    };
  }

  private failed(
    result: RecoveryResult,
    checkpointSeq: number,
    replayedEvents: number,
    reason: string,
    snapshot?: RuntimeSnapshot,
    portfolio?: PortfolioSnapshot,
    replayIntegrityIssues?: readonly RecoveryReplayIntegrityIssue[],
    divergences?: readonly PortfolioDivergence[]
  ): RecoveryReport {
    return {
      mode: result,
      result,
      status: "FAILED_CLOSED",
      checkpointSeq,
      replayedEvents,
      ...(snapshot === undefined ? {} : { snapshot }),
      ...(portfolio === undefined ? {} : { portfolio }),
      reason,
      ...(replayIntegrityIssues === undefined ? {} : { replayIntegrityIssues }),
      ...(divergences === undefined ? {} : { divergences })
    };
  }
}
