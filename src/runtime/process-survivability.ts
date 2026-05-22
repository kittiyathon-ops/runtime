import { TamperEvidentEvidenceLog } from "../audit/tamper-evident-evidence-log.js";
import { PerformanceObserver, performance } from "node:perf_hooks";

export interface ProcessSurvivabilitySample {
  timestamp: number;
  heapUsedBytes: number;
  heapLimitBytes: number;
  gcPauseMs: number;
  windowMs: number;
  asyncQueueDepth: number;
  asyncQueueCapacity: number;
  cpuOverheadRatio: number;
  memoryOverheadRatio: number;
  eventLoopLagMs?: number;
  timerDriftMs?: number;
  websocketProcessingLatencyMs?: number;
  reconciliationLatencyMs?: number;
  reconciliationBlockedMs?: number;
  uptimeMs?: number;
  restartReason?: string;
  activeTrading?: boolean;
}

export interface ProcessSurvivabilityConfig {
  maxHeapUtilization: number;
  maxGcPauseRatio: number;
  maxQueueUtilization: number;
  restartCadenceMs: number;
  maxSurvivabilityCpuMemoryRatio: number;
  maxEventLoopLagMs: number;
  maxTimerDriftMs: number;
  maxWebsocketProcessingLatencyMs: number;
  maxReconciliationBlockedMs: number;
  queueExplosionUtilization: number;
  rollingWindowSize: number;
  memoryLeakSlopeBytesPerSample: number;
}

export interface RollingLatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
}

export interface ProcessRollingMetrics {
  eventLoopLag: RollingLatencyMetrics;
  gcPause: RollingLatencyMetrics;
  timerDrift: RollingLatencyMetrics;
  websocketProcessingLatency: RollingLatencyMetrics;
  reconciliationLatency: RollingLatencyMetrics;
  asyncQueueDepth: RollingLatencyMetrics;
}

export interface ProcessSurvivabilityDecision {
  status:
    | "PROCESS_SURVIVABILITY_OK"
    | "PROCESS_SURVIVABILITY_DEGRADED"
    | "LATENCY_ALERT"
    | "PROCESS_DEGRADED"
    | "SAFE_MODE_REQUIRED"
    | "HALT_NEW_TRADING_REQUIRED"
    | "DETERMINISTIC_RESTART_REQUIRED"
    | "RESTART_REVERIFICATION_REQUIRED";
  heapUtilization: number;
  gcPauseRatio: number;
  queueUtilization: number;
  reasons: string[];
  rollingMetrics: ProcessRollingMetrics;
  memoryLeakSuspected: boolean;
  evidenceHash: string;
}

export interface RestartEligibilityContext {
  runtimeId: string;
  now: number;
  openPositions: boolean;
  disputedTruth: boolean;
  reconnectRecovery: boolean;
  degradedReconciliation: boolean;
  evidenceIds: readonly string[];
}

export interface RestartEligibilityDecision {
  eligible: boolean;
  reason: string;
  blockedBy: string[];
  evidenceHash: string;
}

export interface PreRestartEvidence {
  status: "PRE_RESTART_EVIDENCE_PRESERVED";
  restartSeq: number;
  preservedAt: number;
  evidenceHash: string;
}

export interface RestartReverificationResult {
  status: "RESTART_REVERIFIED" | "RESTART_REVERIFICATION_FAILED";
  restartSeq: number;
  verifiedAt: number;
  evidenceIds: readonly string[];
  evidenceHash: string;
}

export class ProcessSurvivabilityMonitor {
  private readonly evidenceLog = new TamperEvidentEvidenceLog<Record<string, unknown>>();
  private readonly restartDueAtByRuntime = new Map<string, number>();
  private readonly eventLoopLagWindow: number[] = [];
  private readonly gcPauseWindow: number[] = [];
  private readonly timerDriftWindow: number[] = [];
  private readonly websocketLatencyWindow: number[] = [];
  private readonly reconciliationLatencyWindow: number[] = [];
  private readonly queueDepthWindow: number[] = [];
  private readonly heapWindow: number[] = [];
  private readonly config: ProcessSurvivabilityConfig;
  private restartSeq = 0;
  private pendingRestartRuntimeId: string | undefined;

  constructor(config: Partial<ProcessSurvivabilityConfig>) {
    this.config = { ...DEFAULT_PROCESS_SURVIVABILITY_CONFIG, ...config };
    if (this.config.maxHeapUtilization <= 0 || this.config.maxHeapUtilization > 1) throw new Error("process_heap_threshold_invalid");
    if (this.config.maxGcPauseRatio < 0 || this.config.maxGcPauseRatio > 1) throw new Error("process_gc_threshold_invalid");
    if (this.config.maxQueueUtilization <= 0 || this.config.maxQueueUtilization > 1) throw new Error("process_queue_threshold_invalid");
    if (!Number.isInteger(this.config.restartCadenceMs) || this.config.restartCadenceMs <= 0) throw new Error("process_restart_cadence_invalid");
    if (this.config.maxSurvivabilityCpuMemoryRatio <= 0 || this.config.maxSurvivabilityCpuMemoryRatio > 1) {
      throw new Error("process_survivability_overhead_threshold_invalid");
    }
    if (this.config.maxEventLoopLagMs < 0 || this.config.maxTimerDriftMs < 0 || this.config.maxWebsocketProcessingLatencyMs < 0 || this.config.maxReconciliationBlockedMs < 0) {
      throw new Error("process_latency_threshold_invalid");
    }
    if (this.config.queueExplosionUtilization <= 0 || this.config.queueExplosionUtilization > 1) throw new Error("process_queue_explosion_threshold_invalid");
    if (!Number.isInteger(this.config.rollingWindowSize) || this.config.rollingWindowSize <= 0) throw new Error("process_rolling_window_invalid");
  }

  observe(runtimeId: string, sample: ProcessSurvivabilitySample, evidenceIds: readonly string[]): ProcessSurvivabilityDecision {
    if (runtimeId.length === 0) throw new Error("process_runtime_id_required");
    if (evidenceIds.length === 0) throw new Error("process_survivability_requires_evidence");
    validateSample(sample);
    const nextRestartAt = this.restartDueAtByRuntime.get(runtimeId) ?? sample.timestamp + this.config.restartCadenceMs;
    this.restartDueAtByRuntime.set(runtimeId, nextRestartAt);

    const heapUtilization = sample.heapLimitBytes === 0 ? 1 : sample.heapUsedBytes / sample.heapLimitBytes;
    const gcPauseRatio = sample.gcPauseMs / sample.windowMs;
    const queueUtilization = sample.asyncQueueDepth / sample.asyncQueueCapacity;
    this.pushWindow(this.eventLoopLagWindow, sample.eventLoopLagMs ?? 0);
    this.pushWindow(this.gcPauseWindow, sample.gcPauseMs);
    this.pushWindow(this.timerDriftWindow, sample.timerDriftMs ?? 0);
    this.pushWindow(this.websocketLatencyWindow, sample.websocketProcessingLatencyMs ?? 0);
    this.pushWindow(this.reconciliationLatencyWindow, sample.reconciliationLatencyMs ?? 0);
    this.pushWindow(this.queueDepthWindow, sample.asyncQueueDepth);
    this.pushWindow(this.heapWindow, sample.heapUsedBytes);

    const reasons: string[] = [];
    if (heapUtilization > this.config.maxHeapUtilization) reasons.push("heap_pressure");
    if (gcPauseRatio > this.config.maxGcPauseRatio) reasons.push("gc_pause_pressure");
    if (queueUtilization > this.config.maxQueueUtilization) reasons.push("async_queue_pressure");
    if (queueUtilization >= this.config.queueExplosionUtilization) reasons.push("async_queue_explosion");
    if ((sample.eventLoopLagMs ?? 0) > this.config.maxEventLoopLagMs) reasons.push("event_loop_starvation");
    if ((sample.timerDriftMs ?? 0) > this.config.maxTimerDriftMs) reasons.push("timer_drift");
    if ((sample.websocketProcessingLatencyMs ?? 0) > this.config.maxWebsocketProcessingLatencyMs) reasons.push("websocket_processing_blocked");
    if ((sample.reconciliationBlockedMs ?? 0) > this.config.maxReconciliationBlockedMs) reasons.push("reconciliation_starvation");
    if ((sample.activeTrading ?? false) && gcPauseRatio > this.config.maxGcPauseRatio) reasons.push("active_trading_gc_pause");
    if (sample.cpuOverheadRatio > this.config.maxSurvivabilityCpuMemoryRatio) reasons.push("survivability_cpu_overhead");
    if (sample.memoryOverheadRatio > this.config.maxSurvivabilityCpuMemoryRatio) reasons.push("survivability_memory_overhead");
    const memoryLeakSuspected = this.memoryLeakSuspected();
    if (memoryLeakSuspected) reasons.push("memory_leak_suspected");
    if (sample.timestamp >= nextRestartAt) {
      reasons.push("deterministic_restart_cadence_due");
      this.pendingRestartRuntimeId = runtimeId;
    }

    const evidence = this.evidenceLog.append("PROCESS_SURVIVABILITY_SAMPLE", sample.timestamp, {
      runtimeId,
      sample,
      reasons,
      evidenceIds: [...evidenceIds]
    });
    const status =
      this.pendingRestartRuntimeId === runtimeId
        ? "DETERMINISTIC_RESTART_REQUIRED"
        : reasons.includes("reconciliation_starvation")
          ? "SAFE_MODE_REQUIRED"
          : reasons.includes("async_queue_explosion")
            ? "HALT_NEW_TRADING_REQUIRED"
            : reasons.includes("event_loop_starvation")
              ? "PROCESS_DEGRADED"
              : reasons.includes("active_trading_gc_pause")
                ? "LATENCY_ALERT"
        : reasons.length > 0
          ? "PROCESS_SURVIVABILITY_DEGRADED"
          : "PROCESS_SURVIVABILITY_OK";
    return {
      status,
      heapUtilization,
      gcPauseRatio,
      queueUtilization,
      reasons,
      rollingMetrics: this.rollingMetrics(),
      memoryLeakSuspected,
      evidenceHash: evidence.hash
    };
  }

  evaluateRestartEligibility(context: RestartEligibilityContext): RestartEligibilityDecision {
    if (context.runtimeId.length === 0) throw new Error("process_runtime_id_required");
    if (context.evidenceIds.length === 0) throw new Error("restart_eligibility_requires_evidence");
    const blockedBy: string[] = [];
    if (context.openPositions) blockedBy.push("open_positions");
    if (context.disputedTruth) blockedBy.push("disputed_truth");
    if (context.reconnectRecovery) blockedBy.push("reconnect_recovery");
    if (context.degradedReconciliation) blockedBy.push("degraded_reconciliation");
    const evidence = this.evidenceLog.append("RESTART_ELIGIBILITY", context.now, {
      runtimeId: context.runtimeId,
      blockedBy,
      evidenceIds: [...context.evidenceIds]
    });
    return {
      eligible: blockedBy.length === 0,
      reason: blockedBy.length === 0 ? "restart_eligible" : "restart_blocked",
      blockedBy,
      evidenceHash: evidence.hash
    };
  }

  preservePreRestartEvidence(runtimeId: string, timestamp: number, state: Record<string, unknown>, evidenceIds: readonly string[]): PreRestartEvidence {
    if (runtimeId.length === 0) throw new Error("process_runtime_id_required");
    if (evidenceIds.length === 0) throw new Error("pre_restart_evidence_requires_evidence");
    this.restartSeq += 1;
    const evidence = this.evidenceLog.append("PRE_RESTART_EVIDENCE", timestamp, {
      runtimeId,
      restartSeq: this.restartSeq,
      state,
      evidenceIds: [...evidenceIds]
    });
    return {
      status: "PRE_RESTART_EVIDENCE_PRESERVED",
      restartSeq: this.restartSeq,
      preservedAt: timestamp,
      evidenceHash: evidence.hash
    };
  }

  verifyRestart(runtimeId: string, verifiedAt: number, stateReverified: boolean, evidenceIds: readonly string[]): RestartReverificationResult {
    if (runtimeId.length === 0) throw new Error("process_runtime_id_required");
    if (evidenceIds.length === 0) throw new Error("restart_reverification_requires_evidence");
    if (!Number.isInteger(verifiedAt) || verifiedAt < 0) throw new Error("restart_reverification_time_invalid");
    this.restartSeq += 1;
    const status = stateReverified && this.pendingRestartRuntimeId === runtimeId ? "RESTART_REVERIFIED" : "RESTART_REVERIFICATION_FAILED";
    if (status === "RESTART_REVERIFIED") {
      this.pendingRestartRuntimeId = undefined;
      this.restartDueAtByRuntime.set(runtimeId, verifiedAt + this.config.restartCadenceMs);
    }
    const evidence = this.evidenceLog.append("PROCESS_RESTART_REVERIFICATION", verifiedAt, {
      runtimeId,
      restartSeq: this.restartSeq,
      status,
      evidenceIds: [...evidenceIds]
    });
    return { status, restartSeq: this.restartSeq, verifiedAt, evidenceIds: [...evidenceIds], evidenceHash: evidence.hash };
  }

  verifyEvidence(): boolean {
    return this.evidenceLog.verify();
  }

  private rollingMetrics(): ProcessRollingMetrics {
    return {
      eventLoopLag: percentileMetrics(this.eventLoopLagWindow),
      gcPause: percentileMetrics(this.gcPauseWindow),
      timerDrift: percentileMetrics(this.timerDriftWindow),
      websocketProcessingLatency: percentileMetrics(this.websocketLatencyWindow),
      reconciliationLatency: percentileMetrics(this.reconciliationLatencyWindow),
      asyncQueueDepth: percentileMetrics(this.queueDepthWindow)
    };
  }

  private pushWindow(values: number[], value: number): void {
    values.push(value);
    while (values.length > this.config.rollingWindowSize) values.shift();
  }

  private memoryLeakSuspected(): boolean {
    if (this.heapWindow.length < Math.min(5, this.config.rollingWindowSize)) return false;
    const first = this.heapWindow[0]!;
    const last = this.heapWindow[this.heapWindow.length - 1]!;
    return (last - first) / Math.max(1, this.heapWindow.length - 1) > this.config.memoryLeakSlopeBytesPerSample;
  }
}

export const DEFAULT_PROCESS_SURVIVABILITY_CONFIG: ProcessSurvivabilityConfig = {
  maxHeapUtilization: 0.85,
  maxGcPauseRatio: 0.1,
  maxQueueUtilization: 0.8,
  restartCadenceMs: 24 * 60 * 60 * 1_000,
  maxSurvivabilityCpuMemoryRatio: 0.15,
  maxEventLoopLagMs: 100,
  maxTimerDriftMs: 250,
  maxWebsocketProcessingLatencyMs: 100,
  maxReconciliationBlockedMs: 500,
  queueExplosionUtilization: 0.95,
  rollingWindowSize: 256,
  memoryLeakSlopeBytesPerSample: 1024 * 1024
};

export class EventLoopLagMonitor {
  private expectedAt: number | undefined;

  constructor(private readonly intervalMs: number) {
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) throw new Error("event_loop_lag_interval_invalid");
  }

  sample(now = performance.now()): { eventLoopLagMs: number; timerDriftMs: number } {
    if (this.expectedAt === undefined) {
      this.expectedAt = now + this.intervalMs;
      return { eventLoopLagMs: 0, timerDriftMs: 0 };
    }
    const drift = Math.max(0, now - this.expectedAt);
    this.expectedAt = now + this.intervalMs;
    return { eventLoopLagMs: drift, timerDriftMs: drift };
  }
}

export class GcPauseInstrumentation {
  private readonly pauses: number[] = [];
  private observer: PerformanceObserver | undefined;

  start(): void {
    if (this.observer !== undefined) return;
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.pauses.push(entry.duration);
      }
    });
    this.observer.observe({ entryTypes: ["gc"] });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  drainPauseMs(): number {
    const total = this.pauses.reduce((sum, value) => sum + value, 0);
    this.pauses.length = 0;
    return total;
  }
}

export class DeterministicRestartCoordinator {
  constructor(private readonly monitor: ProcessSurvivabilityMonitor) {}

  coordinate(input: {
    runtimeId: string;
    now: number;
    context: Omit<RestartEligibilityContext, "runtimeId" | "now">;
    state: Record<string, unknown>;
  }): RestartEligibilityDecision & { preRestartEvidence?: PreRestartEvidence } {
    const eligibility = this.monitor.evaluateRestartEligibility({
      runtimeId: input.runtimeId,
      now: input.now,
      ...input.context
    });
    if (!eligibility.eligible) return eligibility;
    const preRestartEvidence = this.monitor.preservePreRestartEvidence(
      input.runtimeId,
      input.now,
      input.state,
      input.context.evidenceIds
    );
    return { ...eligibility, preRestartEvidence };
  }
}

function percentileMetrics(values: readonly number[]): RollingLatencyMetrics {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99)
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index]!;
}

function validateSample(sample: ProcessSurvivabilitySample): void {
  for (const value of [
    sample.timestamp,
    sample.heapUsedBytes,
    sample.heapLimitBytes,
    sample.gcPauseMs,
    sample.windowMs,
    sample.asyncQueueDepth,
    sample.asyncQueueCapacity,
    sample.cpuOverheadRatio,
    sample.memoryOverheadRatio,
    sample.eventLoopLagMs ?? 0,
    sample.timerDriftMs ?? 0,
    sample.websocketProcessingLatencyMs ?? 0,
    sample.reconciliationLatencyMs ?? 0,
    sample.reconciliationBlockedMs ?? 0,
    sample.uptimeMs ?? 0
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("process_survivability_sample_invalid");
  }
  if (sample.heapLimitBytes <= 0 || sample.windowMs <= 0 || sample.asyncQueueCapacity <= 0) {
    throw new Error("process_survivability_sample_invalid");
  }
}
