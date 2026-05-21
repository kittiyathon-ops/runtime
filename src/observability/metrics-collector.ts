import { MetricsRegistry, type MetricsSnapshot } from "../infra/metrics.js";

export interface RuntimeDecisionObservation {
  timestamp: number;
  traceId: string;
  decisionType: string;
  durationMs: number;
  queueDepth: number;
  replayDrift: number;
}

export class ObservabilityMetricsCollector {
  private readonly metrics = new MetricsRegistry();
  private latestDecision?: RuntimeDecisionObservation;

  observeDecision(observation: RuntimeDecisionObservation): void {
    if (observation.traceId.length === 0) throw new Error("trace_id_required");
    if (observation.durationMs < 0 || observation.queueDepth < 0 || observation.replayDrift < 0) {
      throw new Error("decision_observation_invalid");
    }
    this.latestDecision = Object.freeze({ ...observation });
    this.metrics.incrementCounter(`decision.${observation.decisionType}.count`);
    this.metrics.observeHistogram(`decision.${observation.decisionType}.latency_ms`, observation.durationMs);
    this.metrics.setGauge("runtime.queue_depth", observation.queueDepth);
    this.metrics.setGauge("runtime.replay_drift", observation.replayDrift);
  }

  latest(): RuntimeDecisionObservation | undefined {
    return this.latestDecision;
  }

  snapshot(): MetricsSnapshot {
    return this.metrics.snapshot();
  }
}
