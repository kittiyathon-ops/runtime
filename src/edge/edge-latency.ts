import type { Clock } from "../infra/clock.js";
import type { EdgeEvent } from "./edge-events.js";
import type { EdgeRecommendation, EdgeSourceId } from "./edge-types.js";

export interface EdgeLatencyOptions {
  windowSize: number;
  spikeThresholdMs: number;
  staleThresholdMs: number;
}

export interface EdgeLatencySnapshot {
  sourceId: EdgeSourceId;
  observedLatencyMs: number;
  maxLatencyMs: number;
  averageLatencyMs: number;
  rollingLatencyMs: number;
  samples: number;
  spike: boolean;
  stale: boolean;
  recommendation: EdgeRecommendation;
}

export class EdgeLatencyTracker {
  private readonly samples = new Map<EdgeSourceId, number[]>();

  constructor(private readonly clock: Clock, private readonly options: EdgeLatencyOptions) {
    if (!Number.isInteger(options.windowSize) || options.windowSize <= 0) throw new Error("edge_latency_window_invalid");
    if (!Number.isFinite(options.spikeThresholdMs) || options.spikeThresholdMs <= 0) throw new Error("edge_latency_spike_threshold_invalid");
    if (!Number.isFinite(options.staleThresholdMs) || options.staleThresholdMs <= 0) throw new Error("edge_latency_stale_threshold_invalid");
  }

  observe(sourceId: EdgeSourceId, eventTimestamp: number): EdgeLatencySnapshot {
    const observedLatencyMs = Math.max(0, this.clock.now() - eventTimestamp);
    const window = this.samples.get(sourceId) ?? [];
    window.push(observedLatencyMs);
    while (window.length > this.options.windowSize) window.shift();
    this.samples.set(sourceId, window);
    const maxLatencyMs = Math.max(...window);
    const averageLatencyMs = window.reduce((sum, value) => sum + value, 0) / window.length;
    const spike = observedLatencyMs >= this.options.spikeThresholdMs;
    const stale = observedLatencyMs >= this.options.staleThresholdMs;
    return {
      sourceId,
      observedLatencyMs,
      maxLatencyMs,
      averageLatencyMs,
      rollingLatencyMs: averageLatencyMs,
      samples: window.length,
      spike,
      stale,
      recommendation: stale ? "SAFE_MODE" : spike ? "THROTTLE" : "ACCEPT"
    };
  }

  toEvent(snapshot: EdgeLatencySnapshot): EdgeEvent | undefined {
    if (!snapshot.spike && !snapshot.stale) return undefined;
    return {
      type: "EDGE_LATENCY_SPIKE",
      timestamp: this.clock.now(),
      sourceId: snapshot.sourceId,
      severity: snapshot.stale ? "CRITICAL" : "WARNING",
      recommendation: snapshot.recommendation,
      evidence: [{
        sourceId: snapshot.sourceId,
        observedLatencyMs: snapshot.observedLatencyMs,
        thresholdMs: snapshot.stale ? this.options.staleThresholdMs : this.options.spikeThresholdMs
      }]
    };
  }

  sampleCount(sourceId: EdgeSourceId): number {
    return this.samples.get(sourceId)?.length ?? 0;
  }
}

