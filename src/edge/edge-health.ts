import type { Clock } from "../infra/clock.js";
import type { EdgeEvent } from "./edge-events.js";
import type { EdgeHealthLevel, EdgeRecommendation, EdgeSourceId } from "./edge-types.js";

export type EdgeConnectionState = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

export interface EdgeHealthOptions {
  staleThresholdMs: number;
  reconnectWindowMs: number;
  reconnectStormThreshold: number;
}

interface SourceHealthState {
  connection: EdgeConnectionState;
  lastMessageAt: number;
  reconnects: number[];
  duplicateDeliveries: number;
  sequenceGaps: number;
}

export interface EdgeHealthSnapshot {
  sourceId: EdgeSourceId;
  level: EdgeHealthLevel;
  connection: EdgeConnectionState;
  stale: boolean;
  reconnectCount: number;
  duplicateDeliveries: number;
  sequenceGaps: number;
  recommendation: EdgeRecommendation;
}

export class EdgeHealthMonitor {
  private readonly sources = new Map<EdgeSourceId, SourceHealthState>();

  constructor(private readonly clock: Clock, private readonly options: EdgeHealthOptions) {}

  connected(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.connection = "CONNECTED";
    state.lastMessageAt = this.clock.now();
    return this.snapshot(sourceId);
  }

  disconnected(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.connection = "DISCONNECTED";
    return this.snapshot(sourceId);
  }

  reconnecting(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.connection = "RECONNECTING";
    state.reconnects.push(this.clock.now());
    this.pruneReconnects(state);
    return this.snapshot(sourceId);
  }

  message(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.lastMessageAt = this.clock.now();
    state.connection = "CONNECTED";
    return this.snapshot(sourceId);
  }

  duplicateDelivery(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.duplicateDeliveries += 1;
    return this.snapshot(sourceId);
  }

  sequenceGap(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    state.sequenceGaps += 1;
    return this.snapshot(sourceId);
  }

  snapshot(sourceId: EdgeSourceId): EdgeHealthSnapshot {
    const state = this.state(sourceId);
    this.pruneReconnects(state);
    const stale = this.clock.now() - state.lastMessageAt > this.options.staleThresholdMs;
    const reconnectStorm = state.reconnects.length >= this.options.reconnectStormThreshold;
    const level: EdgeHealthLevel =
      state.connection === "DISCONNECTED" ? "OFFLINE" :
      stale ? "UNTRUSTED" :
      state.sequenceGaps > 0 ? "UNTRUSTED" :
      reconnectStorm ? "DEGRADED" :
      state.duplicateDeliveries > 0 ? "DEGRADED" :
      "HEALTHY";
    const recommendation: EdgeRecommendation =
      level === "HEALTHY" ? "ACCEPT" :
      level === "DEGRADED" ? "PASSIVE_ONLY" :
      level === "UNTRUSTED" ? "SAFE_MODE" :
      "HALT_INPUT";
    return {
      sourceId,
      level,
      connection: state.connection,
      stale,
      reconnectCount: state.reconnects.length,
      duplicateDeliveries: state.duplicateDeliveries,
      sequenceGaps: state.sequenceGaps,
      recommendation
    };
  }

  toEvent(snapshot: EdgeHealthSnapshot): EdgeEvent | undefined {
    if (snapshot.level === "HEALTHY") return undefined;
    return {
      type: snapshot.stale ? "EDGE_FEED_STALE" : "EDGE_HEALTH_CHANGED",
      timestamp: this.clock.now(),
      sourceId: snapshot.sourceId,
      severity: snapshot.level === "DEGRADED" ? "WARNING" : "CRITICAL",
      recommendation: snapshot.recommendation,
      evidence: [{
        sourceId: snapshot.sourceId,
        count: snapshot.reconnectCount,
        reason: snapshot.level
      }]
    };
  }

  private state(sourceId: EdgeSourceId): SourceHealthState {
    const existing = this.sources.get(sourceId);
    if (existing !== undefined) return existing;
    const created = { connection: "DISCONNECTED" as const, lastMessageAt: this.clock.now(), reconnects: [], duplicateDeliveries: 0, sequenceGaps: 0 };
    this.sources.set(sourceId, created);
    return created;
  }

  private pruneReconnects(state: SourceHealthState): void {
    const now = this.clock.now();
    while (state.reconnects.length > 0 && now - (state.reconnects[0] ?? now) > this.options.reconnectWindowMs) {
      state.reconnects.shift();
    }
  }
}
