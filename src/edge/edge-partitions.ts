import type { Clock } from "../infra/clock.js";
import type { EdgeRecommendation, EdgeSeverity, EdgeSourceId } from "./edge-types.js";

export type EdgePartitionType =
  | "partial_disconnect"
  | "silent_feed"
  | "stale_packets"
  | "reconnect_gap"
  | "asymmetric_source_availability"
  | "source_partition"
  | "local_transport_partition";

export interface EdgePartitionSourceState {
  sourceId: EdgeSourceId;
  connected: boolean;
  lastSeenAt: number;
  reconnecting?: boolean;
}

export interface EdgePartitionReport {
  partitioned: boolean;
  type: EdgePartitionType;
  affectedSources: EdgeSourceId[];
  severity: EdgeSeverity;
  recommendation: EdgeRecommendation;
  evidence: Array<{ sourceId: EdgeSourceId; ageMs: number; reason: string }>;
}

export class EdgePartitionDetector {
  constructor(private readonly clock: Clock, private readonly staleThresholdMs: number) {
    if (!Number.isFinite(staleThresholdMs) || staleThresholdMs <= 0) throw new Error("edge_partition_stale_threshold_invalid");
  }

  detect(sources: readonly EdgePartitionSourceState[]): EdgePartitionReport {
    if (sources.length === 0) throw new Error("edge_partition_sources_required");
    const now = this.clock.now();
    const disconnected = sources.filter((source) => !source.connected);
    const stale = sources.filter((source) => now - source.lastSeenAt > this.staleThresholdMs);
    const reconnecting = sources.filter((source) => source.reconnecting === true);

    if (disconnected.length === sources.length) return this.report("local_transport_partition", disconnected, "FATAL", "HALT_INPUT", now, "all_sources_disconnected");
    if (disconnected.length > 0) return this.report("partial_disconnect", disconnected, "CRITICAL", "PASSIVE_ONLY", now, "partial_disconnect");
    if (stale.length > 0) return this.report("silent_feed", stale, "CRITICAL", "SAFE_MODE", now, "feed_silent_or_stale");
    if (reconnecting.length > 0) return this.report("reconnect_gap", reconnecting, "WARNING", "PASSIVE_ONLY", now, "source_reconnecting");

    return {
      partitioned: false,
      type: "source_partition",
      affectedSources: [],
      severity: "INFO",
      recommendation: "ACCEPT",
      evidence: []
    };
  }

  private report(
    type: EdgePartitionType,
    sources: readonly EdgePartitionSourceState[],
    severity: EdgeSeverity,
    recommendation: EdgeRecommendation,
    now: number,
    reason: string
  ): EdgePartitionReport {
    return {
      partitioned: true,
      type,
      affectedSources: sources.map((source) => source.sourceId),
      severity,
      recommendation,
      evidence: sources.map((source) => ({ sourceId: source.sourceId, ageMs: Math.max(0, now - source.lastSeenAt), reason }))
    };
  }
}

