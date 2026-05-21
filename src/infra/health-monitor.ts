import type { MetricsSnapshot } from "./metrics.js";

export type HealthSeverity = "OK" | "WARN" | "DEGRADED" | "CRITICAL";
export type RuntimeSafetyAction = "NONE" | "SAFE_MODE" | "PASSIVE_ONLY" | "HALT" | "KILL_SWITCH";
export type WebsocketConnectionState = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

export interface HealthStatus {
  severity: HealthSeverity;
  action: RuntimeSafetyAction;
  reasons: string[];
}

export interface HealthMonitorThresholds {
  queueDepthWarn: number;
  queueDepthCritical: number;
  processingLatencyWarnMs: number;
  processingLatencyCriticalMs: number;
  replayLagWarn: number;
  replayLagCritical: number;
  memoryRssWarnBytes: number;
  memoryRssCriticalBytes: number;
  eventRejectRateWarn: number;
  eventRejectRateCritical: number;
}

export interface HealthInputs {
  queueDepth: number;
  processingLatencyMs: number;
  websocketState: WebsocketConnectionState;
  replayLag: number;
  memoryRssBytes: number;
  eventRejectRate: number;
  persistenceAvailable: boolean;
  metrics?: MetricsSnapshot;
}

export interface HealthSnapshot extends HealthInputs {
  status: HealthStatus;
  checkedAt: number;
}

const DEFAULT_THRESHOLDS: HealthMonitorThresholds = {
  queueDepthWarn: 1_000,
  queueDepthCritical: 10_000,
  processingLatencyWarnMs: 25,
  processingLatencyCriticalMs: 250,
  replayLagWarn: 1_000,
  replayLagCritical: 10_000,
  memoryRssWarnBytes: 512 * 1024 * 1024,
  memoryRssCriticalBytes: 1024 * 1024 * 1024,
  eventRejectRateWarn: 0.05,
  eventRejectRateCritical: 0.2
};

export class HealthMonitor {
  private latest?: HealthSnapshot;

  constructor(private readonly thresholds: Partial<HealthMonitorThresholds> = {}) {}

  snapshot(inputs: HealthInputs, checkedAt: number): HealthSnapshot {
    const snapshot: HealthSnapshot = {
      ...inputs,
      status: this.evaluate(inputs),
      checkedAt
    };
    this.latest = snapshot;
    return snapshot;
  }

  current(): HealthSnapshot | undefined {
    return this.latest;
  }

  evaluate(inputs: HealthInputs): HealthStatus {
    const thresholds = { ...DEFAULT_THRESHOLDS, ...this.thresholds };
    const reasons: string[] = [];
    let severity: HealthSeverity = "OK";
    let action: RuntimeSafetyAction = "NONE";

    const raise = (nextSeverity: HealthSeverity, nextAction: RuntimeSafetyAction, reason: string): void => {
      reasons.push(reason);
      if (this.rank(nextSeverity) > this.rank(severity)) severity = nextSeverity;
      if (this.actionRank(nextAction) > this.actionRank(action)) action = nextAction;
    };

    if (inputs.queueDepth >= thresholds.queueDepthCritical) raise("CRITICAL", "SAFE_MODE", "queue_depth_critical");
    else if (inputs.queueDepth >= thresholds.queueDepthWarn) raise("WARN", "NONE", "queue_depth_warn");

    if (inputs.processingLatencyMs >= thresholds.processingLatencyCriticalMs) {
      raise("CRITICAL", "SAFE_MODE", "processing_latency_critical");
    } else if (inputs.processingLatencyMs >= thresholds.processingLatencyWarnMs) {
      raise("WARN", "NONE", "processing_latency_warn");
    }

    if (inputs.websocketState === "DISCONNECTED") raise("CRITICAL", "SAFE_MODE", "websocket_disconnected");
    else if (inputs.websocketState === "RECONNECTING") raise("DEGRADED", "PASSIVE_ONLY", "websocket_reconnecting");

    if (inputs.replayLag >= thresholds.replayLagCritical) raise("CRITICAL", "HALT", "replay_lag_critical");
    else if (inputs.replayLag >= thresholds.replayLagWarn) raise("WARN", "NONE", "replay_lag_warn");

    if (inputs.memoryRssBytes >= thresholds.memoryRssCriticalBytes) raise("CRITICAL", "HALT", "memory_pressure_critical");
    else if (inputs.memoryRssBytes >= thresholds.memoryRssWarnBytes) raise("WARN", "NONE", "memory_pressure_warn");

    if (inputs.eventRejectRate >= thresholds.eventRejectRateCritical) raise("CRITICAL", "KILL_SWITCH", "event_reject_rate_critical");
    else if (inputs.eventRejectRate >= thresholds.eventRejectRateWarn) raise("DEGRADED", "PASSIVE_ONLY", "event_reject_rate_warn");

    if (!inputs.persistenceAvailable) raise("CRITICAL", "HALT", "persistence_unavailable");

    return { severity, action, reasons };
  }

  shouldEnter(snapshot: HealthSnapshot, action: Exclude<RuntimeSafetyAction, "NONE">): boolean {
    return this.actionRank(snapshot.status.action) >= this.actionRank(action);
  }

  private rank(severity: HealthSeverity): number {
    return { OK: 0, WARN: 1, DEGRADED: 2, CRITICAL: 3 }[severity];
  }

  private actionRank(action: RuntimeSafetyAction): number {
    return { NONE: 0, PASSIVE_ONLY: 1, SAFE_MODE: 2, HALT: 3, KILL_SWITCH: 4 }[action];
  }
}
