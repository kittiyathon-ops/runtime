import { AuditLog, type AuditEntry, type AuditSink } from "../audit/audit-log.js";
import { NoopNotifier, TelegramNotifier, type AlertNotifier } from "../alerts/telegram-notifier.js";
import { authorityForExchangeEvent, resolveConflict, type AuthoritativeState, type ExchangeAuthority } from "../arbitration/exchange-state-authority.js";
import {
  BinanceMarketStream,
  normalizeBinanceMarketPayload,
  type BinanceMarketStreamKind,
  type MarketStreamLifecycle
} from "../adapters/binance.js";
import type { EventInput, RuntimeEvent } from "../core/event.js";
import { RuntimeEventSchema } from "../core/event.js";
import { SystemClock, type Clock } from "../core/clock.js";
import { rootCorrelationId } from "../core/ids.js";
import { ExecutionEngine } from "../execution/execution-engine.js";
import { PaperFillSimulator, type MarketSnapshot } from "../execution/paper-fill-simulator.js";
import { PaperPerformanceTracker, type PaperPerformanceSnapshot } from "../execution/paper-performance-tracker.js";
import { ConfigSchema, type RuntimeConfig, type RuntimeConfigInput } from "../infra/config.js";
import { AsyncEventBus } from "../infra/event-bus.js";
import type { EventStore } from "../infra/event-store.js";
import { createLogger, type Logger } from "../infra/logger.js";
import { ShutdownController } from "../infra/shutdown.js";
import { SqliteEventStore } from "../infra/sqlite-event-store.js";
import {
  BinanceLiveExecution,
  type BinanceLiveExecutionLifecycleEvent,
  type LiveExecutionSurvivabilitySnapshot
} from "../live-execution/binance-live-execution.js";
import { buildTelegramAlert } from "../notifications/telegram-alert-builder.js";
import type { TelegramAlertPayload } from "../notifications/telegram-message-types.js";
import { PayloadTrustScorer } from "../bridge/PayloadTrustScoring.js";
import { EdgeAccountingLedger, type EdgeAccountingDecision, type EdgeAttributionInput } from "../economy/edge-attribution.js";
import { PortfolioState } from "../portfolio/portfolio-state.js";
import { ReplayEngine, type ReplayMismatch } from "../replay/replay-engine.js";
import { RiskEngine, type RiskDecision, type RiskState } from "../risk/risk-engine.js";
import {
  CompositeSignalToIntentPolicy,
  RejectAllSignalToIntentPolicy,
  SignalEngine,
  signalIntentDecisionToEventInput,
  type DeterministicSignalStrategy,
  type SignalProvider,
  type SignalToIntentPolicy
} from "../signals/signal-engine.js";
import { RuntimeStateMachine, type RuntimeMode } from "./state-machine.js";
import { CausalReorderBuffer } from "../temporal/causal-reorder-buffer.js";
import { captureConfigEvidence, configFingerprint, type ConfigEvidenceBundle } from "./config-fingerprint.js";
import { truthConfidenceState, type TruthConfidenceState } from "./truth-confidence.js";
import {
  DEFAULT_PROCESS_SURVIVABILITY_CONFIG,
  DeterministicRestartCoordinator,
  ProcessSurvivabilityMonitor,
  type ProcessSurvivabilityDecision,
  type ProcessSurvivabilitySample
} from "./process-survivability.js";

type RuntimeRiskConfig = RuntimeConfig;

type RuntimeDeps = {
  config?: Partial<RuntimeConfigInput>;
  logger?: Logger;
  audit?: AuditSink;
  execution?: ExecutionEngine;
  eventStore?: EventStore;
  eventBus?: AsyncEventBus;
  portfolio?: PortfolioState;
  replay?: ReplayEngine;
  risk?: RiskEngine;
  signals?: SignalEngine;
  notifier?: AlertNotifier;
  shutdown?: ShutdownController;
  clock?: Clock;
  liveExecution?: BinanceLiveExecution;
};

export interface IngestOptions {
  bypassDuplicateChecks?: boolean;
}

type RuntimeSnapshot = {
  seq: number;
  risk: RiskState;
};

interface RuntimeMetrics {
  eventsProcessed: number;
  eventsRejected: number;
  maxQueueDepthObserved: number;
  lastProcessingLatencyMs: number;
  maxProcessingLatencyMs: number;
  replayEventsProcessed: number;
  replayThroughputEventsPerSecond: number;
  safeModeCount: number;
  websocketReconnectCount: number;
  liveExecutionReconnectCount: number;
  orphanFillsDetected: number;
  liveExecutionDegraded: boolean;
  signalsGenerated: number;
  signalsRejected: number;
  paperFillsGenerated: number;
  simulatedSlippageBps: number;
  simulatedNotionalUsd: number;
  paperRealizedPnlUsd: number;
  paperUnrealizedPnlUsd: number;
  paperMaxDrawdownUsd: number;
  paperWinRate: number;
}

export interface RuntimeHealth {
  mode: RuntimeMode;
  running: boolean;
  seq: number;
  queueDepth: number;
  activeIngests: number;
  eventsProcessed: number;
  eventsRejected: number;
  maxQueueDepthObserved: number;
  lastProcessingLatencyMs: number;
  maxProcessingLatencyMs: number;
  replayEventsProcessed: number;
  replayThroughputEventsPerSecond: number;
  safeModeCount: number;
  websocketReconnectCount: number;
  liveExecutionReconnectCount: number;
  orphanFillsDetected: number;
  liveExecutionDegraded: boolean;
  signalsGenerated: number;
  signalsRejected: number;
  paperFillsGenerated: number;
  simulatedSlippageBps: number;
  simulatedNotionalUsd: number;
  paperRealizedPnlUsd: number;
  paperUnrealizedPnlUsd: number;
  paperMaxDrawdownUsd: number;
  paperWinRate: number;
}

class BoundedIdSet<T> {
  private readonly values = new Set<T>();
  private readonly order: T[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("idempotency_capacity_invalid");
    }
  }

  has(value: T): boolean {
    return this.values.has(value);
  }

  add(value: T): void {
    if (this.values.has(value)) return;
    this.values.add(value);
    this.order.push(value);
    while (this.order.length > this.capacity) {
      const evicted = this.order.shift();
      if (evicted !== undefined) {
        this.values.delete(evicted);
      }
    }
  }
}

class CheckpointManager {
  private snapshots: RuntimeSnapshot[] = [];

  save(snapshot: RuntimeSnapshot): void {
    this.snapshots.push(snapshot);
  }

  latest(): RuntimeSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }
}

export class TradingRuntime {
  private running = false;

  private seq = 0;

  private timer?: NodeJS.Timeout;

  private static readonly HEALTH_REPORT_INTERVAL_MS = 1_000;

  private readonly config: RuntimeRiskConfig;

  private readonly eventStore: EventStore;

  private readonly audit: AuditSink;

  private readonly logger: Logger;

  private readonly notifier: AlertNotifier;

  private readonly clock: Clock;

  private readonly alertSentAtByKey = new Map<string, number>();

  private static readonly ALERT_DEDUPE_WINDOW_MS = 60_000;

  private static readonly PERSISTED_SEQ_SCAN_BATCH_SIZE = 10_000;

  private readonly marketStreams: BinanceMarketStream[] = [];

  private shutdownStarted = false;

  private activeIngests = 0;

  private readonly ingestIdleWaiters: Array<() => void> = [];

  private readonly seenSeq: BoundedIdSet<number>;

  private readonly seenEventIds: BoundedIdSet<string>;

  private readonly submittedOrderKeys: BoundedIdSet<string>;

  private readonly liveOrderIds: BoundedIdSet<string>;
  private readonly exchangeStateByKey = new Map<string, AuthoritativeState<Record<string, unknown>>>();
  private readonly causalReorderBuffer: CausalReorderBuffer;
  private readonly startupConfigEvidence: ConfigEvidenceBundle;
  private readonly payloadTrustScorer = new PayloadTrustScorer();
  private readonly processSurvivability = new ProcessSurvivabilityMonitor(DEFAULT_PROCESS_SURVIVABILITY_CONFIG);
  private readonly restartCoordinator = new DeterministicRestartCoordinator(this.processSurvivability);
  private readonly edgeAccounting = new EdgeAccountingLedger();
  private causalUncertaintyCount = 0;
  private confidenceDowngradeCount = 0;
  private disputedTruth = false;
  private unknownTruth = false;
  private truthConfidence: TruthConfidenceState = truthConfidenceState({
    causalUncertaintyCount: 0,
    confidenceDowngradeCount: 0,
    disputed: false,
    unknown: false
  });

  private readonly expectedPositions = new Map<string, number>();

  private readonly strategySignalToIntentPolicy = new CompositeSignalToIntentPolicy();

  private signalToIntentPolicy: SignalToIntentPolicy = new RejectAllSignalToIntentPolicy();

  private readonly marketSnapshots = new Map<string, MarketSnapshot>();

  private readonly paperFillSimulator: PaperFillSimulator;

  private readonly liveExecution: BinanceLiveExecution;

  private readonly paperPerformance = new PaperPerformanceTracker();

  private readonly metrics: RuntimeMetrics = {
    eventsProcessed: 0,
    eventsRejected: 0,
    maxQueueDepthObserved: 0,
    lastProcessingLatencyMs: 0,
    maxProcessingLatencyMs: 0,
    replayEventsProcessed: 0,
    replayThroughputEventsPerSecond: 0,
    safeModeCount: 0,
    websocketReconnectCount: 0,
    liveExecutionReconnectCount: 0,
    orphanFillsDetected: 0,
    liveExecutionDegraded: false,
    signalsGenerated: 0,
    signalsRejected: 0,
    paperFillsGenerated: 0,
    simulatedSlippageBps: 0,
    simulatedNotionalUsd: 0,
    paperRealizedPnlUsd: 0,
    paperUnrealizedPnlUsd: 0,
    paperMaxDrawdownUsd: 0,
    paperWinRate: 0
  };

  public readonly events: AsyncEventBus;

  public readonly execution: ExecutionEngine;

  public readonly portfolio: PortfolioState;

  public readonly replay: ReplayEngine;

  public readonly risk: RiskEngine;

  public readonly signals: SignalEngine;

  public readonly shutdown: ShutdownController;

  public readonly state = new RuntimeStateMachine();

  public readonly checkpoints = new CheckpointManager();

  constructor(private readonly deps?: RuntimeDeps) {
    this.config = ConfigSchema.parse(deps?.config ?? {});
    this.logger = deps?.logger ?? createLogger(this.config);
    this.events = deps?.eventBus ?? new AsyncEventBus(this.config.eventQueueCapacity);
    this.eventStore = deps?.eventStore ?? new SqliteEventStore(this.config.sqlitePath);
    this.audit = deps?.audit ?? new AuditLog(this.logger);
    this.notifier = deps?.notifier ?? (this.config.telegramAlertsEnabled ? new TelegramNotifier(this.config) : new NoopNotifier());
    this.clock = deps?.clock ?? new SystemClock();
    this.seenSeq = new BoundedIdSet<number>(this.config.idempotencyCacheSize);
    this.seenEventIds = new BoundedIdSet<string>(this.config.idempotencyCacheSize);
    this.submittedOrderKeys = new BoundedIdSet<string>(this.config.idempotencyCacheSize);
    this.liveOrderIds = new BoundedIdSet<string>(this.config.idempotencyCacheSize);
    this.causalReorderBuffer = new CausalReorderBuffer(this.config.maxReorderWindowMs);
    this.startupConfigEvidence = captureConfigEvidence(this.config, this.clock.nowMs());
    this.portfolio = deps?.portfolio ?? new PortfolioState();
    this.replay = deps?.replay ?? new ReplayEngine();
    this.risk = deps?.risk ?? new RiskEngine(this.config, this.portfolio);
    this.signals = deps?.signals ?? new SignalEngine();
    this.execution = deps?.execution ?? new ExecutionEngine(this.risk);
    this.paperFillSimulator = new PaperFillSimulator(this.config.paperFillSlippageBps);
    this.liveExecution = deps?.liveExecution ?? new BinanceLiveExecution(
      (event) => this.ingestBinanceLiveExecutionEvent(event),
      (event) => this.handleLiveExecutionLifecycle(event),
      { config: this.config }
    );
    this.shutdown = deps?.shutdown ?? new ShutdownController();
    this.shutdown.onShutdown(async () => {
      await this.waitForIngestIdle();
      await this.events.drain();
      this.flushEventStore();
      this.eventStore.close();
      if (this.state.mode() !== "HALTED") {
        this.state.transition("HALTED");
      }
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.restorePersistedSequenceState();
    this.running = true;
    this.auditDecision({
      action: "runtime_started",
      runtimeProfile: this.config.runtimeProfile,
      limits: this.auditLimits(),
      metrics: {
        configFingerprint: this.startupConfigEvidence.fingerprint,
        configEvidenceId: this.startupConfigEvidence.evidenceId
      }
    });
    this.timer = setInterval(() => {
      this.reportRuntimeHealth();
    }, TradingRuntime.HEALTH_REPORT_INTERVAL_MS);
    this.timer.unref?.();

    console.log(`runtime.start() profile=${this.config.runtimeProfile} dryRun=${this.config.dryRun} killSwitch=${this.config.killSwitch}`);
  }

  async stop(): Promise<void> {
    this.shutdownStarted = true;
    this.running = false;

    for (const stream of this.marketStreams) {
      stream.close();
    }
    this.marketStreams.length = 0;
    this.liveExecution.close();

    if (this.timer) {
      clearInterval(this.timer);
    }

    if (this.state.mode() !== "HALTED" && this.state.mode() !== "STOPPING") {
      this.state.transition("STOPPING");
    }

    await this.shutdown.shutdown();
    this.auditDecision({ action: "runtime_stopped" });

    console.log("runtime.stop()");
  }

  async ingest(input: EventInput, options: IngestOptions = {}): Promise<void> {
    if (this.shutdownStarted || this.state.mode() === "STOPPING" || this.state.mode() === "HALTED" || this.state.mode() === "GOVERNANCE_HALT") {
      this.auditDecision({ action: "event_rejected", reason: "runtime_shutdown" });
      throw new Error("runtime_shutdown");
    }
    this.assertQueueDepthAllowsIngest(input);

    const startedAt = this.clock.monotonicMs();
    let event: RuntimeEvent | undefined;
    this.activeIngests += 1;
    try {
      event = await this.ingestAccepted(input, options);
    } finally {
      this.activeIngests -= 1;
      this.resolveIngestIdleIfDrained();
    }
    await this.observeProcessingLatency(this.clock.monotonicMs() - startedAt, event);
  }

  private async ingestAccepted(input: EventInput, options: IngestOptions): Promise<RuntimeEvent> {
    let event: RuntimeEvent;
    try {
      event = this.toRuntimeEvent(input);
    } catch (error) {
      this.auditDecision({
        action: "event_rejected",
        eventType: input.eventType,
        correlationId: input.correlationId,
        reason: error instanceof Error ? error.message : "event_invalid"
      });
      throw error;
    }
    event = this.withIdempotencyContract(event);

    const bypassDuplicateChecks = this.canBypassDuplicateChecks(options);
    try {
      this.assertEventIdempotent(event, bypassDuplicateChecks);
    } catch (error) {
      this.auditDuplicateRejection(event, error instanceof Error ? error.message : "duplicate_event");
      throw error;
    }
    this.assertConfigFingerprintValid("ingest");
    const exchangeConflictDecision = await this.resolveExchangeAuthority(event);
    if (exchangeConflictDecision === "rejected_lower_authority") {
      this.auditDuplicateRejection(event, "lower_authority_conflict");
      return event;
    }
    if (exchangeConflictDecision === "halt_required") {
      this.saveCheckpoint();
      return event;
    }

    if (event.eventType === "INTENT_CREATED") {
      const confidenceDecision = await this.applyTruthConfidenceOrderGovernance(event);
      if (!confidenceDecision.allow) {
        this.saveCheckpoint();
        return event;
      }
      try {
        this.assertOrderSubmissionIdempotent(event, bypassDuplicateChecks);
      } catch (error) {
        this.auditDuplicateRejection(event, error instanceof Error ? error.message : "duplicate_order_intent");
        throw error;
      }
      const decision = this.risk.evaluateIntent(event, this.clock.nowMs());
      if (!decision.allow) {
        await this.enterSafeMode(event, decision.reason ?? "kill_switch");
        this.saveCheckpoint();
        return event;
      }
      if (!this.state.canSubmitOrders()) {
        if (this.state.mode() === "SAFE_MODE") {
          await this.enterSafeMode(event, "order_creation_disallowed");
        }
        this.saveCheckpoint();
        return event;
      }
    } else {
      await this.publishAccepted(event, { bypassDuplicateChecks, checked: true });
      await this.observeAcceptedOrderSubmission(event);
      if (await this.failClosedOnOrphanFill(event)) {
        this.saveCheckpoint();
        return event;
      }
      this.observeMarketSnapshot(event);
      this.portfolio.apply(event);
      this.observePaperPerformance(event);
      const reconciliation = this.reconcilePortfolio(event);
      if (!reconciliation.allow) {
        await this.enterSafeModeWithNextSeq(event, reconciliation);
        this.saveCheckpoint();
        return event;
      }
      const decision = this.risk.observe(event);
      if (!decision.allow) {
        await this.enterSafeModeWithNextSeq(event, decision);
      }
      await this.evaluatePaperFill(event);
      await this.evaluateSignalToIntentPolicy(event);
      await this.evaluateSignals(event);
      this.saveCheckpoint();
      return event;
    }

    await this.publishAccepted(event, { bypassDuplicateChecks, checked: true });
    this.portfolio.apply(event);
    const observedIntent = this.risk.observe(event);
    if (!observedIntent.allow) {
      await this.enterSafeModeWithNextSeq(event, observedIntent);
      this.saveCheckpoint();
      return event;
    }

    if (event.eventType === "INTENT_CREATED") {
      const result = this.execution.simulate(
        event,
        this.state.mode(),
        () => {
          this.seq += 1;
          return this.seq;
        },
        this.clock.nowMs()
      );
      if (!result.accepted && result.events.length === 0) {
        this.saveCheckpoint();
        return event;
      }
      for (const producedEvent of result.events) {
        const acceptedProducedEvent = this.withLiveExecutionMetadata(event, producedEvent);
        if (acceptedProducedEvent.eventType === "ORDER_SUBMITTED") {
          this.auditDecision({
            action: "dry_run_order_submitted_generated",
            seq: acceptedProducedEvent.seq,
            eventType: acceptedProducedEvent.eventType,
            correlationId: acceptedProducedEvent.correlationId
          });
        }
        await this.publishAccepted(acceptedProducedEvent);
        await this.observeAcceptedOrderSubmission(acceptedProducedEvent);
        this.risk.observe(acceptedProducedEvent);
        await this.evaluatePaperFill(acceptedProducedEvent);
      }
      if (result.events.some((producedEvent) => producedEvent.eventType === "ORDER_SUBMITTED")) {
        this.submittedOrderKeys.add(this.orderSubmissionKey(event));
      }
    }

    this.saveCheckpoint();
    return event;
  }

  replayPersisted(fromSeq = 1, limit = 10_000): ReplayMismatch[] {
    this.assertConfigFingerprintValid("replay");
    this.auditDecision({ action: "replay_started", seq: fromSeq });
    const previousMode = this.state.mode();
    try {
      if (previousMode !== "REPLAY") {
        this.state.transition("REPLAY");
      }
      const startedAt = this.clock.monotonicMs();
      const events = this.eventStore.readFrom(fromSeq, limit);
      this.observeReplayThroughput(events.length, this.clock.monotonicMs() - startedAt);
      this.observeReplayLag(events.length);
      const mismatches = this.replay.verify(events);
      if (mismatches.length > 0) {
        const firstMismatch = mismatches[0];
        this.auditDecision({
          action: "replay_failed",
          ...(firstMismatch ? { seq: firstMismatch.seq, reason: firstMismatch.reason } : {})
        });
      } else {
        this.auditDecision({ action: "replay_completed", seq: fromSeq });
      }
      return mismatches;
    } catch (error) {
      this.auditDecision({
        action: "replay_failed",
        seq: fromSeq,
        reason: error instanceof Error ? error.message : "replay_failed"
      });
      throw error;
    } finally {
      if (previousMode !== "REPLAY" && this.state.mode() === "REPLAY") {
        this.state.transition(previousMode);
      }
    }
  }

  transitionMode(mode: RuntimeMode): void {
    this.state.transition(mode);
  }

  governanceHalt(reason: string, evidenceIds: readonly string[] = ["governance_halt"]): void {
    if (reason.length === 0) throw new Error("governance_halt_reason_required");
    if (evidenceIds.length === 0) throw new Error("governance_halt_requires_evidence");
    this.risk.halt(reason);
    this.state.transition("GOVERNANCE_HALT");
    this.auditDecision({
      action: "governance_halt_entered",
      reason,
      metrics: { evidenceIds: [...evidenceIds] }
    });
  }

  hibernate(reason: string, evidenceIds: readonly string[] = ["runtime_hibernation"]): void {
    if (reason.length === 0) throw new Error("hibernation_reason_required");
    if (evidenceIds.length === 0) throw new Error("hibernation_requires_evidence");
    if (this.state.mode() !== "HIBERNATION_MODE") {
      this.state.transition("HIBERNATION_MODE");
    }
    this.auditDecision({
      action: "hibernation_mode_entered",
      reason,
      metrics: { evidenceIds: [...evidenceIds] }
    });
  }

  registerSignalProvider(provider: SignalProvider): void {
    this.signals.register(provider);
  }

  registerSignalStrategy(strategy: DeterministicSignalStrategy): void {
    this.signals.registerStrategy(strategy);
    this.strategySignalToIntentPolicy.register(strategy);
    this.signalToIntentPolicy = this.strategySignalToIntentPolicy;
  }

  registerSignalToIntentPolicy(policy: SignalToIntentPolicy): void {
    this.signalToIntentPolicy = policy;
  }

  healthSnapshot(): RuntimeHealth {
    const queueDepth = this.events.size();
    this.observeQueueDepth(queueDepth);
    return {
      mode: this.state.mode(),
      running: this.running,
      seq: this.seq,
      queueDepth,
      activeIngests: this.activeIngests,
      eventsProcessed: this.metrics.eventsProcessed,
      eventsRejected: this.metrics.eventsRejected,
      maxQueueDepthObserved: this.metrics.maxQueueDepthObserved,
      lastProcessingLatencyMs: this.metrics.lastProcessingLatencyMs,
      maxProcessingLatencyMs: this.metrics.maxProcessingLatencyMs,
      replayEventsProcessed: this.metrics.replayEventsProcessed,
      replayThroughputEventsPerSecond: this.metrics.replayThroughputEventsPerSecond,
      safeModeCount: this.metrics.safeModeCount,
      websocketReconnectCount: this.metrics.websocketReconnectCount,
      liveExecutionReconnectCount: this.metrics.liveExecutionReconnectCount,
      orphanFillsDetected: this.metrics.orphanFillsDetected,
      liveExecutionDegraded: this.metrics.liveExecutionDegraded,
      signalsGenerated: this.metrics.signalsGenerated,
      signalsRejected: this.metrics.signalsRejected,
      paperFillsGenerated: this.metrics.paperFillsGenerated,
      simulatedSlippageBps: this.metrics.simulatedSlippageBps,
      simulatedNotionalUsd: this.metrics.simulatedNotionalUsd,
      paperRealizedPnlUsd: this.metrics.paperRealizedPnlUsd,
      paperUnrealizedPnlUsd: this.metrics.paperUnrealizedPnlUsd,
      paperMaxDrawdownUsd: this.metrics.paperMaxDrawdownUsd,
      paperWinRate: this.metrics.paperWinRate
    };
  }

  paperPerformanceSnapshot(): PaperPerformanceSnapshot {
    return this.paperPerformance.snapshot();
  }

  observeProcessSurvivability(sample?: Partial<ProcessSurvivabilitySample>): ProcessSurvivabilityDecision {
    const now = this.clock.nowMs();
    const memory = process.memoryUsage();
    const fullSample: ProcessSurvivabilitySample = {
      timestamp: sample?.timestamp ?? now,
      heapUsedBytes: sample?.heapUsedBytes ?? memory.heapUsed,
      heapLimitBytes: sample?.heapLimitBytes ?? Math.max(memory.heapTotal, memory.heapUsed, 1),
      gcPauseMs: sample?.gcPauseMs ?? 0,
      windowMs: sample?.windowMs ?? TradingRuntime.HEALTH_REPORT_INTERVAL_MS,
      asyncQueueDepth: sample?.asyncQueueDepth ?? this.events.size(),
      asyncQueueCapacity: sample?.asyncQueueCapacity ?? this.config.eventQueueCapacity,
      cpuOverheadRatio: sample?.cpuOverheadRatio ?? 0,
      memoryOverheadRatio: sample?.memoryOverheadRatio ?? 0,
      eventLoopLagMs: sample?.eventLoopLagMs ?? 0,
      timerDriftMs: sample?.timerDriftMs ?? 0,
      websocketProcessingLatencyMs: sample?.websocketProcessingLatencyMs ?? this.metrics.lastProcessingLatencyMs,
      reconciliationLatencyMs: sample?.reconciliationLatencyMs ?? 0,
      reconciliationBlockedMs: sample?.reconciliationBlockedMs ?? 0,
      uptimeMs: sample?.uptimeMs ?? Math.floor(process.uptime() * 1_000),
      restartReason: sample?.restartReason ?? "deterministic_cadence",
      activeTrading: sample?.activeTrading ?? this.state.canSubmitOrders()
    };
    const decision = this.processSurvivability.observe("trading-runtime", fullSample, ["process_survivability_sample"]);
    this.auditDecision({
      action: "process_survivability_observed",
      reason: decision.status,
      value: decision.heapUtilization,
      metrics: {
        ...decision,
        sample: fullSample
      }
    });
    this.applyProcessSurvivabilityDecision(decision, fullSample);
    if (decision.status === "DETERMINISTIC_RESTART_REQUIRED") {
      const coordinated = this.restartCoordinator.coordinate({
        runtimeId: "trading-runtime",
        now,
        context: {
          openPositions: this.hasOpenPositions(),
          disputedTruth: this.disputedTruth,
          reconnectRecovery: this.metrics.liveExecutionDegraded,
          degradedReconciliation: decision.reasons.includes("reconciliation_starvation"),
          evidenceIds: ["restart_eligibility", "pre_restart_state"]
        },
        state: {
          mode: this.state.mode(),
          seq: this.seq,
          configFingerprint: this.startupConfigEvidence.fingerprint,
          checkpointSeq: this.checkpoints.latest()?.seq,
          queueDepth: this.events.size()
        }
      });
      this.auditDecision({
        action: "deterministic_restart_coordinated",
        reason: coordinated.reason,
        metrics: {
          eligible: coordinated.eligible,
          blockedBy: coordinated.blockedBy,
          evidenceHash: coordinated.evidenceHash,
          preRestartEvidence: coordinated.preRestartEvidence
        }
      });
      if (!coordinated.eligible) {
        return decision;
      }
      const reverified = this.processSurvivability.verifyRestart(
        "trading-runtime",
        now,
        this.configFingerprintCurrent() === this.startupConfigEvidence.fingerprint && this.checkpoints.latest() !== undefined,
        ["config_fingerprint", "checkpoint_state"]
      );
      this.auditDecision({
        action: "process_restart_reverified",
        reason: reverified.status,
        metrics: reverified as unknown as Record<string, unknown>
      });
      if (reverified.status !== "RESTART_REVERIFIED") {
        this.enterSafeModeForRuntimeBreach("restart_reverification_failed");
      }
    }
    return decision;
  }

  recordEdgeAttributionReport(input: EdgeAttributionInput): EdgeAccountingDecision {
    const decision = this.edgeAccounting.record(input);
    this.auditDecision({
      action: "edge_attribution_report",
      reason: decision.status,
      value: decision.report.netRealizedEdgeBps,
      metrics: {
        report: decision.report,
        violations: decision.violations,
        consecutiveNonPositiveDays: decision.consecutiveNonPositiveDays,
        evidenceHash: decision.evidenceHash,
        marketEdgeBps: decision.report.strategyGrossEdgeBps,
        runtimeEdgeBps: decision.report.executionQualityEdgeBps
      }
    });
    if (decision.status === "ECONOMICALLY_UNVIABLE_REQUIRED") {
      this.state.transition("ECONOMICALLY_UNVIABLE", ["negative_net_edge"]);
      this.auditDecision({
        action: "economically_unviable_entered",
        reason: decision.violations.join(","),
        value: decision.report.netRealizedEdgeBps,
        metrics: {
          reportId: decision.report.reportId,
          consecutiveNonPositiveDays: decision.consecutiveNonPositiveDays,
          evidenceHash: decision.evidenceHash
        }
      });
    }
    return decision;
  }

  connectBinanceMarketData(symbol: string): void {
    // TODO(runtime-boundary): move this Binance-specific compatibility bridge into adapter orchestration.
    // TradingRuntime should eventually depend only on RuntimeMarketDataAdapter and canonical EventInput.
    const stream = new BinanceMarketStream(
      this.config,
      this.clock,
      this.logger,
      (event) => this.ingestExternalMarketEvent(event),
      (event) => this.handleMarketStreamLifecycle(event)
    );
    stream.connectBookTicker(symbol);
    stream.connectTrades(symbol);
    stream.connectMarkPrice(symbol);
    this.marketStreams.push(stream);
  }

  async connectBinanceUserStream(symbols: readonly string[]): Promise<void> {
    const snapshot = await this.refreshLiveExecutionSurvivabilitySnapshot(symbols, ["connect_user_stream_survivability_snapshot"]);
    if (snapshot.status !== "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY") {
      throw new Error(`live_execution_survivability_snapshot_degraded:${snapshot.failures.join(",")}`);
    }
    await this.liveExecution.connectUserStream(symbols);
  }

  async refreshLiveExecutionSurvivabilitySnapshot(symbols: readonly string[] = this.config.binanceSymbols, evidenceIds: readonly string[] = ["runtime_live_execution_survivability_snapshot"]): Promise<LiveExecutionSurvivabilitySnapshot> {
    const snapshot = await this.liveExecution.refreshSurvivabilitySnapshot(symbols, evidenceIds);
    this.metrics.liveExecutionDegraded = snapshot.status !== "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY";
    this.auditDecision({
      action: "live_execution_survivability_snapshot_refreshed",
      reason: snapshot.status,
      metrics: {
        symbols: [...snapshot.symbols],
        failures: [...snapshot.failures],
        evidenceIds: [...snapshot.evidenceIds]
      }
    });
    return snapshot;
  }

  async fetchStartupExchangeTruth(evidenceIds: readonly string[] = ["runtime_startup_exchange_truth"]) {
    return this.liveExecution.fetchStartupExchangeTruth(evidenceIds);
  }

  async ingestBinanceMarketPayload(
    stream: BinanceMarketStreamKind,
    symbol: string,
    payload: Record<string, unknown>,
    receiveTimestamp?: number
  ): Promise<void> {
    // TODO(runtime-boundary): keep raw exchange payload normalization outside TradingRuntime.
    // This method remains as a test/integration compatibility seam while adapters are being extracted.
    try {
      await this.ingestExternalMarketEvent(normalizeBinanceMarketPayload(stream, symbol, payload, receiveTimestamp ?? this.clock.nowMs()));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "malformed_exchange_payload";
      if (reason.startsWith("malformed_exchange_payload")) {
        await this.enterSafeModeFromMarketStream(symbol, "malformed_exchange_payload", rootCorrelationId());
      }
      throw error;
    }
  }

  async ingestExternalMarketEvent(input: EventInput): Promise<void> {
    if (input.source !== "binance_market_ws") {
      throw new Error("external_market_event_source_invalid");
    }
    if (input.eventType !== "MARKET_TICK" && input.eventType !== "BOOK_UPDATE") {
      throw new Error("external_market_event_type_invalid");
    }
    const enveloped = this.withExchangeEnvelope(input);
    this.assertPayloadTrusted(enveloped);
    await this.ingestCausalExchangeEvent(enveloped);
  }

  async ingestBinanceLiveExecutionEvent(input: EventInput): Promise<void> {
    if (input.source !== "binance_user_ws") {
      throw new Error("live_execution_event_source_invalid");
    }
    if (
      input.eventType !== "ORDER_ACCEPTED" &&
      input.eventType !== "ORDER_FILLED" &&
      input.eventType !== "ORDER_REJECTED" &&
      input.eventType !== "EXECUTION_ERROR" &&
      input.eventType !== "POSITION_UPDATED"
    ) {
      throw new Error("live_execution_event_type_invalid");
    }
    const enveloped = this.withExchangeEnvelope(input);
    this.assertPayloadTrusted(enveloped);
    await this.ingestCausalExchangeEvent(enveloped);
  }

  async flushCausalExchangeEvents(): Promise<void> {
    const drained = this.causalReorderBuffer.drain(this.clock.monotonicMs());
    this.auditCausalUncertainty(drained.uncertainty);
    for (const event of drained.ready) {
      await this.ingest(event);
    }
  }

  async handleLiveExecutionLifecycle(event: BinanceLiveExecutionLifecycleEvent): Promise<void> {
    if (event.action === "reconnecting") {
      this.metrics.liveExecutionReconnectCount += 1;
    }
    this.metrics.liveExecutionDegraded = event.action === "partitioned" || event.action === "reconnecting";
    this.auditDecision({
      action: `live_execution_${event.action}`,
      ...(event.symbol === undefined ? {} : { symbol: event.symbol }),
      reason: event.reason ?? event.action
    });

    if (event.action === "fatal_shutdown") {
      this.auditDecision({
        action: "live_execution_fatal_shutdown",
        ...(event.symbol === undefined ? {} : { symbol: event.symbol }),
        reason: event.reason ?? "fatal_exchange_auth_state"
      });
      this.governanceHalt(event.reason ?? "fatal_exchange_auth_state", ["live_execution_fatal_shutdown"]);
      return;
    }

    if (event.action === "partitioned") {
      this.risk.halt("live_execution_websocket_partition");
      await this.enterSafeModeFromMarketStream(event.symbol ?? "UNKNOWN", "live_execution_websocket_partition", rootCorrelationId());
      return;
    }

    if (event.action === "recovered") {
      this.auditDecision({
        action: "live_execution_reconciliation_recommended",
        ...(event.symbol === undefined ? {} : { symbol: event.symbol }),
        reason: "websocket_reconnect_recovery"
      });
    }
  }

  async handleMarketStreamLifecycle(event: {
    action: MarketStreamLifecycle;
    symbol: string;
    stream: BinanceMarketStreamKind;
    reason?: string;
  }): Promise<void> {
    if (event.action === "reconnecting") {
      this.metrics.websocketReconnectCount += 1;
    }
    this.auditDecision({
      action: `market_stream_${event.action}`,
      symbol: event.symbol,
      reason: event.reason ?? event.stream
    });

    if (event.action === "disconnected") {
      this.risk.halt("websocket_disconnect");
      await this.enterSafeModeFromMarketStream(event.symbol, "websocket_disconnect", rootCorrelationId());
      return;
    }

    if (event.action === "stale_stream_detected") {
      const reason = event.reason?.startsWith("malformed_exchange_payload")
        ? "malformed_exchange_payload"
        : "stale_market_stream";
      this.risk.halt(reason);
      await this.enterSafeModeFromMarketStream(event.symbol, reason, rootCorrelationId());
    }
  }

  private async evaluateSignals(event: RuntimeEvent): Promise<void> {
    if (event.eventType !== "MARKET_TICK" && event.eventType !== "BOOK_UPDATE") {
      return;
    }
    if (this.signals.listProviders().length === 0) {
      return;
    }

    const signalEvents = await this.signals.evaluate(event, { nowMs: this.clock.nowMs() });
    for (const signalEvent of signalEvents) {
      try {
        await this.ingest(signalEvent);
        this.metrics.signalsGenerated += 1;
      } catch (error) {
        this.metrics.signalsRejected += 1;
        this.auditDecision({
          action: "signal_rejected",
          eventType: signalEvent.eventType,
          correlationId: signalEvent.correlationId,
          reason: error instanceof Error ? error.message : "signal_rejected"
        });
      }
    }
  }

  private async evaluateSignalToIntentPolicy(event: RuntimeEvent): Promise<void> {
    if (event.eventType !== "SIGNAL_CREATED") {
      return;
    }

    if (!this.state.canSubmitOrders()) {
      this.auditDecision({
        action: "signal_intent_rejected",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: "runtime_mode_disallows_signal_intent"
      });
      return;
    }

    const decision = await this.signalToIntentPolicy.evaluate(event, { nowMs: this.clock.nowMs() });
    if (!decision.allow) {
      this.auditDecision({
        action: "signal_intent_rejected",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: decision.reason ?? "signal_to_intent_rejected"
      });
      return;
    }

    try {
      await this.ingest(signalIntentDecisionToEventInput(this.signalToIntentPolicy, event, decision, { nowMs: this.clock.nowMs() }));
      this.auditDecision({
        action: "signal_intent_generated",
        seq: event.seq,
        eventType: "INTENT_CREATED",
        correlationId: event.correlationId
      });
    } catch (error) {
      this.auditDecision({
        action: "signal_intent_rejected",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: error instanceof Error ? error.message : "signal_intent_rejected"
      });
    }
  }

  private async evaluatePaperFill(event: RuntimeEvent): Promise<void> {
    if (!this.config.paperFillSimulationEnabled || event.eventType !== "ORDER_SUBMITTED") {
      return;
    }
    if (!this.state.canSubmitOrders()) {
      this.auditDecision({
        action: "paper_fill_skipped",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: "runtime_mode_disallows_paper_fill"
      });
      return;
    }

    const snapshot = this.marketSnapshots.get(event.symbol);
    if (snapshot === undefined) {
      this.auditDecision({
        action: "paper_fill_skipped",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: "missing_market_snapshot"
      });
      return;
    }

    const result = this.paperFillSimulator.simulate(
      event,
      snapshot,
      () => {
        this.seq += 1;
        return this.seq;
      },
      this.clock.nowMs()
    );
    if (result === undefined) {
      return;
    }

    this.metrics.paperFillsGenerated += 1;
    this.metrics.simulatedSlippageBps = result.slippageBps;
    this.metrics.simulatedNotionalUsd += result.notionalUsd;
    this.auditDecision({
      action: "paper_fill_generated",
      seq: result.event.seq,
      eventType: result.event.eventType,
      correlationId: result.event.correlationId,
      metric: "paper_fill",
      value: result.notionalUsd,
      reason: "dry_run_simulated_fill"
    });
    await this.ingest({
      seq: result.event.seq,
      timestamp: result.event.timestamp,
      receiveTimestamp: result.event.receiveTimestamp,
      processingTimestamp: result.event.processingTimestamp ?? result.event.timestamp,
      source: result.event.source,
      symbol: result.event.symbol,
      eventType: result.event.eventType,
      correlationId: result.event.correlationId,
      causationId: result.event.causationId,
      payload: result.event.payload
    });
  }

  private async observeAcceptedOrderSubmission(event: RuntimeEvent): Promise<void> {
    if (event.eventType !== "ORDER_SUBMITTED") {
      return;
    }

    for (const orderId of this.orderIdentifiers(event)) {
      this.liveOrderIds.add(orderId);
    }

    if (!this.shouldSubmitLiveOrder(event)) {
      return;
    }

    try {
      await this.liveExecution.submitOrder(event);
      this.auditDecision({
        action: "live_order_submission_attested",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        symbol: event.symbol,
        reason: "binance_live_execution"
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "live_order_submission_failed";
      this.risk.halt(reason);
      await this.enterSafeModeWithNextSeq(event, { allow: false, reason });
    }
  }

  private withLiveExecutionMetadata(intent: RuntimeEvent, producedEvent: RuntimeEvent): RuntimeEvent {
    if (producedEvent.eventType !== "ORDER_SUBMITTED") {
      return producedEvent;
    }
    const liveExecution = intent.payload.liveExecution === true ? { liveExecution: true } : {};
    const executionMode = intent.payload.executionMode === "LIVE" ? { executionMode: "LIVE" } : {};
    const dailyLoss = typeof intent.payload.dailyLossUsd === "number" ? { dailyLossUsd: intent.payload.dailyLossUsd } : {};
    if (Object.keys(liveExecution).length === 0 && Object.keys(executionMode).length === 0 && Object.keys(dailyLoss).length === 0) {
      return producedEvent;
    }
    return RuntimeEventSchema.parse({
      ...producedEvent,
      payload: {
        ...producedEvent.payload,
        ...liveExecution,
        ...executionMode,
        ...dailyLoss
      }
    });
  }

  private shouldSubmitLiveOrder(event: RuntimeEvent): boolean {
    if (this.state.mode() === "REPLAY" || this.state.mode() === "HIBERNATION_MODE" || this.state.mode() === "GOVERNANCE_HALT" || !this.state.canSubmitOrders()) {
      return false;
    }
    return event.payload.liveExecution === true || event.payload.executionMode === "LIVE";
  }

  private async failClosedOnOrphanFill(event: RuntimeEvent): Promise<boolean> {
    if (event.source !== "binance_user_ws" || event.eventType !== "ORDER_FILLED") {
      return false;
    }
    const orderIds = this.orderIdentifiers(event);
    const matched = orderIds.some((orderId) => this.liveOrderIds.has(orderId));
    if (matched) {
      return false;
    }

    const reason = "orphan_fill";
    this.metrics.orphanFillsDetected += 1;
    this.auditDecision({
      action: "orphan_fill_detected",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId,
      symbol: event.symbol,
      reason
    });
    this.risk.halt(reason);
    await this.enterSafeModeWithNextSeq(event, { allow: false, reason });
    return true;
  }

  private orderIdentifiers(event: RuntimeEvent): string[] {
    const candidates = [
      event.payload.orderClientId,
      event.payload.clientOrderId,
      event.payload.orderId,
      event.payload.idempotencyKey,
      event.causationId
    ];
    return candidates
      .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
      .map((value) => String(value))
      .filter((value) => value.length > 0);
  }

  private observeMarketSnapshot(event: RuntimeEvent): void {
    if (event.eventType !== "MARKET_TICK" && event.eventType !== "BOOK_UPDATE") {
      return;
    }

    const bid = Number(event.payload.bidPrice ?? event.payload.bid);
    const ask = Number(event.payload.askPrice ?? event.payload.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) {
      return;
    }
    this.marketSnapshots.set(event.symbol, {
      symbol: event.symbol,
      bid,
      ask,
      timestamp: event.receiveTimestamp ?? event.timestamp
    });
  }

  private observePaperPerformance(event: RuntimeEvent): void {
    if (event.eventType !== "ORDER_FILLED" || event.payload.simulator !== "paper_fill") {
      return;
    }

    const snapshot = this.paperPerformance.apply(event);
    this.metrics.paperRealizedPnlUsd = snapshot.realizedPnlUsd;
    this.metrics.paperUnrealizedPnlUsd = snapshot.unrealizedPnlUsd;
    this.metrics.paperMaxDrawdownUsd = snapshot.maxDrawdownUsd;
    this.metrics.paperWinRate = snapshot.winRate;
    this.auditDecision({
      action: "paper_performance_updated",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId,
      metrics: snapshot as unknown as Record<string, unknown>
    });
  }

  private toRuntimeEvent(input: EventInput): RuntimeEvent {
    const now = this.clock.nowMs();
    const event = RuntimeEventSchema.parse({
      ...input,
      seq: input.seq ?? this.seq + 1,
      timestamp: input.timestamp ?? now,
      processingTimestamp: input.processingTimestamp ?? now
    });
    return event;
  }

  private toSafeModeEvent(causationEvent: RuntimeEvent, reason: string, seq = causationEvent.seq): RuntimeEvent {
    return RuntimeEventSchema.parse({
      seq,
      timestamp: causationEvent.timestamp,
      receiveTimestamp: causationEvent.receiveTimestamp,
      processingTimestamp: causationEvent.processingTimestamp,
      source: "runtime",
      symbol: causationEvent.symbol,
      eventType: "SAFE_MODE",
      correlationId: causationEvent.correlationId,
      causationId: String(causationEvent.seq),
      payload: { reason }
    });
  }

  private async enterSafeMode(causationEvent: RuntimeEvent, reason: string): Promise<void> {
    if (this.state.mode() !== "SAFE_MODE") {
      this.state.transition("SAFE_MODE");
    }
    this.auditDecision({
      action: "safe_mode_entered",
      seq: causationEvent.seq,
      eventType: causationEvent.eventType,
      correlationId: causationEvent.correlationId,
      reason
    });
    await this.publishAccepted(this.toSafeModeEvent(causationEvent, reason));
  }

  private async enterSafeModeWithNextSeq(causationEvent: RuntimeEvent, decision: RiskDecision): Promise<void> {
    this.seq += 1;
    if (this.state.mode() !== "SAFE_MODE") {
      this.state.transition("SAFE_MODE");
    }
    this.auditDecision({
      action: "safe_mode_entered",
      seq: causationEvent.seq,
      eventType: causationEvent.eventType,
      correlationId: causationEvent.correlationId,
      reason: decision.reason ?? "risk_halt"
    });
    await this.publishAccepted(this.toSafeModeEvent(causationEvent, decision.reason ?? "risk_halt", this.seq));
  }

  private async enterSafeModeFromMarketStream(symbol: string, reason: string, correlationId: string): Promise<void> {
    if (this.state.mode() !== "SAFE_MODE") {
      this.state.transition("SAFE_MODE");
    }
    const now = this.clock.nowMs();
    const event = RuntimeEventSchema.parse({
      seq: this.seq + 1,
      timestamp: now,
      receiveTimestamp: now,
      processingTimestamp: now,
      source: "runtime",
      symbol,
      eventType: "SAFE_MODE",
      correlationId,
      causationId: "market_stream",
      payload: { reason }
    });
    this.auditDecision({
      action: "safe_mode_entered",
      seq: event.seq,
      eventType: event.eventType,
      correlationId,
      reason
    });
    await this.publishAccepted(event);
    this.saveCheckpoint();
  }

  private assertQueueDepthAllowsIngest(input: EventInput): void {
    const queueDepth = this.events.size();
    this.observeQueueDepth(queueDepth);
    if (queueDepth < this.config.maxQueueDepth) return;

    const reason = "queue_depth_halt";
    this.auditMetricBreach("queue_depth", queueDepth, this.config.maxQueueDepth, reason);
    this.auditDecision({
      action: "backpressure_breach",
      eventType: input.eventType,
      correlationId: input.correlationId,
      queueDepth,
      threshold: this.config.maxQueueDepth,
      reason
    });
    this.enterSafeModeForRuntimeBreach(reason);
    throw new Error(`queue_depth_exceeded:${queueDepth}`);
  }

  private async observeProcessingLatency(processingLatencyMs: number, event?: RuntimeEvent): Promise<void> {
    this.metrics.lastProcessingLatencyMs = processingLatencyMs;
    this.metrics.maxProcessingLatencyMs = Math.max(this.metrics.maxProcessingLatencyMs, processingLatencyMs);
    if (processingLatencyMs > this.config.latencyHaltMs) {
      const reason = "processing_latency_halt";
      this.auditMetricBreach("processing_latency_ms", processingLatencyMs, this.config.latencyHaltMs, reason);
      this.auditDecision({
        action: "latency_breach",
        ...(event === undefined
          ? {}
          : { seq: event.seq, eventType: event.eventType, correlationId: event.correlationId }),
        processingLatencyMs,
        threshold: this.config.latencyHaltMs,
        reason
      });
      this.risk.halt(reason);
      if (event !== undefined && this.canEnterSafeMode()) {
        await this.enterSafeModeWithNextSeq(event, { allow: false, reason });
      } else {
        this.enterSafeModeForRuntimeBreach(reason);
      }
      this.saveCheckpoint();
      return;
    }

    if (processingLatencyMs > this.config.hotPathWarnMs) {
      this.auditDecision({
        action: "latency_warning",
        ...(event === undefined
          ? {}
          : { seq: event.seq, eventType: event.eventType, correlationId: event.correlationId }),
        processingLatencyMs,
        threshold: this.config.hotPathWarnMs,
        reason: "transient_processing_latency"
      });
    }
  }

  private observeReplayLag(replayLag: number): void {
    if (replayLag <= this.config.maxReplayLag) return;

    const reason = "replay_lag_halt";
    this.auditMetricBreach("replay_lag", replayLag, this.config.maxReplayLag, reason);
    this.auditDecision({
      action: "replay_lag_breach",
      replayLag,
      threshold: this.config.maxReplayLag,
      reason
    });
    this.risk.halt(reason);
    this.enterSafeModeForRuntimeBreach(reason);
    this.saveCheckpoint();
  }

  private canEnterSafeMode(): boolean {
    return this.state.mode() === "NORMAL" || this.state.mode() === "PAPER" || this.state.mode() === "REPLAY";
  }

  private enterSafeModeForRuntimeBreach(reason: string): void {
    if (!this.canEnterSafeMode()) return;
    this.state.transition("SAFE_MODE");
    this.auditDecision({ action: "safe_mode_entered", reason });
  }

  private async publishAccepted(
    event: RuntimeEvent,
    options: { bypassDuplicateChecks?: boolean; checked?: boolean } = {}
  ): Promise<void> {
    if (options.checked !== true) {
      this.assertEventIdempotent(event, options.bypassDuplicateChecks === true);
    }
    await this.events.publish(event, { bypassSequenceGuard: options.bypassDuplicateChecks === true });
    this.eventStore.append(event);
    this.markEventAccepted(event, options.bypassDuplicateChecks === true);
    this.auditDecision({
      action: "event_accepted",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId
    });
  }

  private saveCheckpoint(): void {
    this.checkpoints.save({
      seq: this.seq,
      risk: this.risk.snapshot()
    });
  }

  private restorePersistedSequenceState(): void {
    let cursor = 1;
    while (true) {
      const events = this.eventStore.readFrom(cursor, TradingRuntime.PERSISTED_SEQ_SCAN_BATCH_SIZE);
      if (events.length === 0) return;

      let maxSeqInBatch = cursor - 1;
      for (const event of events) {
        this.seq = Math.max(this.seq, event.seq);
        maxSeqInBatch = Math.max(maxSeqInBatch, event.seq);
        this.seenSeq.add(event.seq);
        if (event.eventId !== undefined) {
          this.seenEventIds.add(event.eventId);
        }
        if (event.eventType === "ORDER_SUBMITTED") {
          for (const orderId of this.orderIdentifiers(event)) {
            this.liveOrderIds.add(orderId);
          }
        }
      }

      if (events.length < TradingRuntime.PERSISTED_SEQ_SCAN_BATCH_SIZE) return;
      cursor = maxSeqInBatch + 1;
    }
  }

  private waitForIngestIdle(): Promise<void> {
    if (this.activeIngests === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.ingestIdleWaiters.push(resolve);
    });
  }

  private resolveIngestIdleIfDrained(): void {
    if (this.activeIngests !== 0) return;
    const waiters = this.ingestIdleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  private auditDecision(entry: AuditEntry): void {
    if (entry.action === "event_accepted") {
      this.metrics.eventsProcessed += 1;
    } else if (entry.action === "event_rejected") {
      this.metrics.eventsRejected += 1;
    } else if (entry.action === "safe_mode_entered") {
      this.metrics.safeModeCount += 1;
    }
    this.audit.record(entry);
    this.alertForAuditEntry(entry);
  }

  private alertForAuditEntry(entry: AuditEntry): void {
    if (!this.shouldSendAlert(entry)) return;
    const message = this.alertMessage(entry);
    if (message === undefined) return;
    void this.notifier.sendAlert(message).catch((error) => {
      this.audit.record({
        action: "telegram_alert_failed",
        reason: error instanceof Error ? error.message : "telegram_alert_failed"
      });
    });
  }

  private shouldSendAlert(entry: AuditEntry): boolean {
    const key = this.alertDedupeKey(entry);
    if (key === undefined) return true;

    const now = this.clock.nowMs();
    const lastSentAt = this.alertSentAtByKey.get(key);
    if (lastSentAt !== undefined && now - lastSentAt < TradingRuntime.ALERT_DEDUPE_WINDOW_MS) {
      return false;
    }
    this.alertSentAtByKey.set(key, now);
    return true;
  }

  private alertDedupeKey(entry: AuditEntry): string | undefined {
    if (
      entry.action !== "safe_mode_entered" &&
      entry.action !== "event_rejected" &&
      entry.action !== "market_stream_disconnected" &&
      entry.action !== "market_stream_reconnecting"
    ) {
      return undefined;
    }

    return [
      entry.action,
      entry.reason ?? "unknown",
      entry.symbol ?? "global",
      entry.eventType ?? "runtime"
    ].join(":");
  }

  private alertMessage(entry: AuditEntry): string | undefined {
    const payload = this.alertPayload(entry);
    return payload === undefined ? undefined : buildTelegramAlert(payload);
  }

  private alertPayload(entry: AuditEntry): TelegramAlertPayload | undefined {
    const language = this.config.telegramLanguage;
    const mode = this.config.telegramAlertMode;
    if (entry.action === "runtime_started") {
      return {
        kind: "runtime_started",
        severity: "INFO",
        primaryTag: "#RUNTIME",
        language,
        mode,
        profile: String(entry.runtimeProfile ?? "unknown")
      };
    }
    if (entry.action === "runtime_stopped") {
      return { kind: "runtime_stopped", severity: "INFO", primaryTag: "#RUNTIME", language, mode };
    }
    if (entry.action === "safe_mode_entered") {
      return {
        kind: "safe_mode",
        severity: "CRITICAL",
        primaryTag: "#RUNTIME",
        secondaryTags: ["#RISK"],
        language,
        mode,
        reason: entry.reason ?? "unknown",
        correlationId: entry.correlationId ?? "n/a",
        correlation: this.alertCorrelation(entry)
      };
    }
    if (entry.action === "live_execution_fatal_shutdown" || entry.action === "hibernation_mode_entered") {
      return {
        kind: "runtime_error",
        severity: "CRITICAL",
        primaryTag: "#RUNTIME",
        language,
        mode,
        reason: entry.reason ?? entry.action,
        correlationId: entry.correlationId ?? "n/a",
        correlation: this.alertCorrelation(entry)
      };
    }
    if (entry.action === "dry_run_order_submitted_generated") {
      return {
        kind: "order_submitted",
        severity: "INFO",
        primaryTag: "#ORDER",
        language,
        mode,
        correlationId: entry.correlationId ?? "n/a",
        correlation: this.alertCorrelation(entry),
        ...(entry.seq === undefined ? {} : { seq: entry.seq })
      };
    }
    if (entry.action === "paper_fill_generated") {
      return {
        kind: "order_filled",
        severity: "INFO",
        primaryTag: "#ORDER",
        language,
        mode,
        value: entry.value ?? "n/a",
        correlationId: entry.correlationId ?? "n/a",
        correlation: this.alertCorrelation(entry),
        ...(entry.seq === undefined ? {} : { seq: entry.seq })
      };
    }
    if (entry.action === "event_rejected") {
      return {
        kind: "runtime_error",
        severity: "CRITICAL",
        primaryTag: "#RUNTIME",
        language,
        mode,
        reason: entry.reason ?? "unknown",
        correlationId: entry.correlationId ?? "n/a",
        correlation: this.alertCorrelation(entry)
      };
    }
    if (entry.action === "market_stream_disconnected") {
      return {
        kind: "websocket_disconnected",
        severity: "WARNING",
        primaryTag: "#WS",
        language,
        mode,
        symbol: entry.symbol ?? "n/a",
        reason: entry.reason ?? "unknown",
        correlation: this.alertCorrelation(entry)
      };
    }
    if (entry.action === "market_stream_reconnecting") {
      return {
        kind: "websocket_reconnecting",
        severity: "WARNING",
        primaryTag: "#WS",
        language,
        mode,
        symbol: entry.symbol ?? "n/a",
        reason: entry.reason ?? "unknown",
        correlation: this.alertCorrelation(entry)
      };
    }
    if (entry.action === "paper_performance_updated") {
      const realized = Number(entry.metrics?.realizedPnlUsd ?? 0);
      const unrealized = Number(entry.metrics?.unrealizedPnlUsd ?? 0);
      const maxDrawdownUsd = Number(entry.metrics?.maxDrawdownUsd);
      const winRate = Number(entry.metrics?.winRate);
      return {
        kind: "pnl_snapshot",
        severity: "INFO",
        primaryTag: "#ORDER",
        language,
        mode,
        realizedPnlUsd: realized,
        unrealizedPnlUsd: unrealized,
        totalPnlUsd: realized + unrealized,
        correlation: this.alertCorrelation(entry),
        ...(Number.isFinite(maxDrawdownUsd) ? { maxDrawdownUsd } : {}),
        ...(Number.isFinite(winRate) ? { winRate } : {})
      };
    }
    return undefined;
  }

  private alertCorrelation(entry: AuditEntry): TelegramAlertPayload["correlation"] {
    return {
      ...(entry.correlationId === undefined ? {} : { traceId: entry.correlationId }),
      ...(entry.eventType === undefined || entry.seq === undefined ? {} : { eventId: `${entry.eventType}:${entry.seq}` })
    };
  }

  private auditMetricBreach(metric: string, value: number, threshold: number, reason: string): void {
    this.audit.record({
      action: "runtime_metric_breach",
      metric,
      value,
      threshold,
      reason
    });
  }

  private reportRuntimeHealth(): void {
    this.flushEventStore();
    this.observeProcessSurvivability();
    this.auditDecision({
      action: "runtime_health_report",
      metrics: this.healthSnapshot() as unknown as Record<string, unknown>
    });
  }

  private flushEventStore(): void {
    try {
      this.eventStore.flush?.();
    } catch (error) {
      this.audit.record({
        action: "event_store_flush_failed",
        reason: error instanceof Error ? error.message : "event_store_flush_failed"
      });
      this.risk.halt("event_store_flush_failed");
      this.enterSafeModeForRuntimeBreach("event_store_flush_failed");
    }
  }

  private observeQueueDepth(queueDepth: number): void {
    this.metrics.maxQueueDepthObserved = Math.max(this.metrics.maxQueueDepthObserved, queueDepth);
  }

  private observeReplayThroughput(eventCount: number, elapsedMs: number): void {
    this.metrics.replayEventsProcessed += eventCount;
    const elapsedSeconds = Math.max(1, elapsedMs) / 1_000;
    this.metrics.replayThroughputEventsPerSecond = eventCount / elapsedSeconds;
  }

  private auditLimits(): Record<string, number> {
    return {
      eventQueueCapacity: this.config.eventQueueCapacity,
      maxQueueDepth: this.config.maxQueueDepth,
      maxReplayLag: this.config.maxReplayLag,
      hotPathWarnMs: this.config.hotPathWarnMs,
      staleDataHaltMs: this.config.staleDataHaltMs,
      latencyHaltMs: this.config.latencyHaltMs,
      maxRejectRate: this.config.maxRejectRate,
      maxExposureUsd: this.config.maxExposureUsd,
      maxDrawdownUsd: this.config.maxDrawdownUsd,
      idempotencyCacheSize: this.config.idempotencyCacheSize,
      maxReorderWindowMs: this.config.maxReorderWindowMs,
      clockSkewAlertMs: this.config.clockSkewAlertMs
    };
  }

  private applyProcessSurvivabilityDecision(decision: ProcessSurvivabilityDecision, sample: ProcessSurvivabilitySample): void {
    if (decision.status === "LATENCY_ALERT") {
      this.auditDecision({
        action: "LATENCY_ALERT",
        reason: "excessive_gc_pause_during_active_trading",
        value: sample.gcPauseMs,
        threshold: DEFAULT_PROCESS_SURVIVABILITY_CONFIG.maxGcPauseRatio,
        metrics: {
          gcPauseRatio: decision.gcPauseRatio,
          rollingMetrics: decision.rollingMetrics,
          evidenceHash: decision.evidenceHash
        }
      });
    }
    if (decision.status === "PROCESS_DEGRADED") {
      this.auditDecision({
        action: "PROCESS_DEGRADED",
        reason: "event_loop_blocked",
        value: sample.eventLoopLagMs ?? 0,
        threshold: DEFAULT_PROCESS_SURVIVABILITY_CONFIG.maxEventLoopLagMs,
        metrics: {
          reasons: decision.reasons,
          rollingMetrics: decision.rollingMetrics,
          evidenceHash: decision.evidenceHash
        }
      });
    }
    if (decision.status === "SAFE_MODE_REQUIRED") {
      this.auditDecision({
        action: "PROCESS_DEGRADED",
        reason: "reconciliation_starvation",
        value: sample.reconciliationBlockedMs ?? 0,
        threshold: DEFAULT_PROCESS_SURVIVABILITY_CONFIG.maxReconciliationBlockedMs,
        metrics: {
          reasons: decision.reasons,
          rollingMetrics: decision.rollingMetrics,
          evidenceHash: decision.evidenceHash
        }
      });
      this.risk.halt("reconciliation_starvation");
      this.enterSafeModeForRuntimeBreach("reconciliation_starvation");
    }
    if (decision.status === "HALT_NEW_TRADING_REQUIRED") {
      this.auditDecision({
        action: "PROCESS_DEGRADED",
        reason: "async_queue_explosion_halt_new_trading",
        value: decision.queueUtilization,
        threshold: DEFAULT_PROCESS_SURVIVABILITY_CONFIG.queueExplosionUtilization,
        metrics: {
          reasons: decision.reasons,
          rollingMetrics: decision.rollingMetrics,
          evidenceHash: decision.evidenceHash
        }
      });
      this.risk.halt("async_queue_explosion");
      this.enterSafeModeForRuntimeBreach("async_queue_explosion");
    }
    if (decision.memoryLeakSuspected) {
      this.auditDecision({
        action: "PROCESS_DEGRADED",
        reason: "memory_leak_suspected",
        metrics: {
          rollingMetrics: decision.rollingMetrics,
          evidenceHash: decision.evidenceHash
        }
      });
    }
  }

  private hasOpenPositions(): boolean {
    for (const quantity of this.expectedPositions.values()) {
      if (quantity !== 0) return true;
    }
    return false;
  }

  private assertPayloadTrusted(input: EventInput): void {
    const assessment = this.payloadTrustScorer.assess(input);
    this.auditDecision({
      action: "payload_trust_assessed",
      eventType: input.eventType,
      correlationId: input.correlationId,
      symbol: input.symbol,
      value: assessment.trustScore,
      reason: assessment.acceptanceDecision,
      metrics: { flags: assessment.flags }
    });
    if (assessment.acceptanceDecision === "ACCEPT") return;
    this.confidenceDowngradeCount += 1;
    this.refreshTruthConfidence();
    this.auditDecision({
      action: "CONFIDENCE_DOWNGRADE",
      eventType: input.eventType,
      correlationId: input.correlationId,
      symbol: input.symbol,
      reason: `payload_trust_${assessment.acceptanceDecision.toLowerCase()}`,
      value: assessment.trustScore,
      metrics: { flags: assessment.flags }
    });
    if (assessment.acceptanceDecision === "QUARANTINE") {
      this.disputedTruth = true;
      this.refreshTruthConfidence();
      throw new Error(`payload_quarantined:${assessment.flags.join(",")}`);
    }
    this.unknownTruth = true;
    this.refreshTruthConfidence();
    this.enterSafeModeForRuntimeBreach("payload_trust_rejected");
    throw new Error(`payload_rejected:${assessment.flags.join(",")}`);
  }

  private withExchangeEnvelope(input: EventInput): EventInput {
    const receivedAt = input.receiveTimestamp ?? this.clock.nowMs();
    const exchangeTimestamp = input.exchangeTimestamp ?? input.timestamp ?? receivedAt;
    const sequenceId = this.sequenceIdFromPayload(input.payload) ?? input.seq ?? exchangeTimestamp;
    return {
      ...input,
      eventId: input.eventId ?? `${input.source}:${input.eventType}:${input.symbol}:${input.correlationId}:${sequenceId}`,
      timestamp: input.timestamp ?? receivedAt,
      exchangeTimestamp,
      receiveTimestamp: receivedAt,
      processingTimestamp: input.processingTimestamp ?? receivedAt,
      payload: {
        ...input.payload,
        sequence_id: sequenceId
      }
    };
  }

  private async ingestCausalExchangeEvent(input: EventInput): Promise<void> {
    this.assertExchangeEventTimeSemantics(input);
    this.observeClockSkew(input);
    const enriched = this.withCausalPayload(input);
    const drained = this.causalReorderBuffer.push(enriched, this.clock.monotonicMs());
    this.auditCausalUncertainty(drained.uncertainty);
    for (const event of drained.ready) {
      await this.ingest(event);
    }
  }

  private assertExchangeEventTimeSemantics(input: EventInput): void {
    if (input.exchangeTimestamp === undefined) {
      this.auditDecision({
        action: "CAUSAL_UNCERTAINTY",
        eventType: input.eventType,
        correlationId: input.correlationId,
        symbol: input.symbol,
        reason: "missing_exchange_time"
      });
    }
    if (input.receiveTimestamp === undefined) {
      throw new Error("received_time_required");
    }
  }

  private withCausalPayload(input: EventInput): EventInput {
    const receivedTime = input.receiveTimestamp ?? this.clock.nowMs();
    const sequenceId = this.sequenceIdFromPayload(input.payload);
    return {
      ...input,
      receiveTimestamp: receivedTime,
      payload: {
        ...input.payload,
        exchange_time: input.exchangeTimestamp ?? input.timestamp ?? receivedTime,
        received_time: receivedTime,
        received_time_monotonic_ms: this.clock.monotonicMs(),
        ...(sequenceId === undefined ? {} : { sequence_id: sequenceId })
      }
    };
  }

  private observeClockSkew(input: EventInput): void {
    if (input.exchangeTimestamp === undefined || input.receiveTimestamp === undefined) return;
    const skew = Math.abs(input.receiveTimestamp - input.exchangeTimestamp);
    if (skew <= this.config.clockSkewAlertMs) return;
    this.auditDecision({
      action: "CLOCK_SKEW_ALERT",
      eventType: input.eventType,
      correlationId: input.correlationId,
      symbol: input.symbol,
      value: skew,
      threshold: this.config.clockSkewAlertMs,
      reason: "exchange_local_clock_skew"
    });
  }

  private auditCausalUncertainty(uncertainty: readonly { eventId: string; reason: string }[]): void {
    for (const issue of uncertainty) {
      this.causalUncertaintyCount += 1;
      this.auditDecision({
        action: "CAUSAL_UNCERTAINTY",
        correlationId: issue.eventId,
        reason: issue.reason
      });
      this.auditDecision({
        action: "CONFIDENCE_DOWNGRADE",
        correlationId: issue.eventId,
        reason: "causal_order_uncertain"
      });
    }
    if (uncertainty.length > 0) this.refreshTruthConfidence();
  }

  private async resolveExchangeAuthority(event: RuntimeEvent): Promise<"accepted" | "rejected_lower_authority" | "halt_required"> {
    if (event.source !== "binance_user_ws") return "accepted";
    const current = this.exchangeAuthoritativeState(event);
    const key = this.exchangeStateKey(event);
    const previous = this.exchangeStateByKey.get(key);
    if (previous === undefined) {
      this.exchangeStateByKey.set(key, current);
      return "accepted";
    }

    const resolved = resolveConflict(previous, current, this.audit);
    if (resolved.status === "HALT_REQUIRED") {
      this.disputedTruth = true;
      this.refreshTruthConfidence();
      const reason = resolved.reason;
      this.risk.halt(reason);
      this.state.transition("GOVERNANCE_HALT", resolved.evidenceIds);
      this.auditDecision({
        action: "governance_halt_entered",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        symbol: event.symbol,
        reason,
        metrics: { evidenceIds: resolved.evidenceIds }
      });
      return "halt_required";
    }

    this.exchangeStateByKey.set(key, {
      authority: resolved.selectedAuthority,
      state: resolved.state,
      evidenceId: resolved.evidenceIds.at(-1) ?? current.evidenceId,
      observedAt: current.observedAt
    });
    if (resolved.selectedAuthority !== current.authority && resolved.downgradedAuthority === current.authority) {
      this.confidenceDowngradeCount += 1;
      this.refreshTruthConfidence();
      return "rejected_lower_authority";
    }
    return "accepted";
  }

  private exchangeAuthoritativeState(event: RuntimeEvent): AuthoritativeState {
    return {
      authority: authorityForExchangeEvent(event) as ExchangeAuthority,
      state: this.exchangeComparableState(event),
      evidenceId: event.eventId ?? `${event.eventType}:${event.seq}`,
      observedAt: event.exchangeTimestamp ?? event.timestamp
    };
  }

  private exchangeComparableState(event: RuntimeEvent): Record<string, unknown> {
    return {
      symbol: event.symbol,
      orderId: event.payload.orderId,
      orderClientId: event.payload.orderClientId ?? event.payload.clientOrderId,
      status: event.payload.status,
      quantity: event.payload.quantity,
      price: event.payload.price,
      positionQuantity: event.payload.positionQuantity
    };
  }

  private exchangeStateKey(event: RuntimeEvent): string {
    const orderId = event.payload.orderId ?? event.payload.orderClientId ?? event.payload.clientOrderId;
    return `${event.symbol}:${String(orderId ?? event.correlationId)}`;
  }

  private assertConfigFingerprintValid(context: "ingest" | "replay"): void {
    const current = this.configFingerprintCurrent();
    if (current === this.startupConfigEvidence.fingerprint) return;
    this.auditDecision({
      action: "CONFIG_DRIFT_DETECTED",
      reason: context,
      metrics: {
        expectedConfigFingerprint: this.startupConfigEvidence.fingerprint,
        actualConfigFingerprint: current,
        configEvidenceId: this.startupConfigEvidence.evidenceId
      }
    });
    throw new Error(`config_drift_detected:${context}`);
  }

  private configFingerprintCurrent(): string {
    return configFingerprint(this.config);
  }

  private withIdempotencyContract(event: RuntimeEvent): RuntimeEvent {
    if (event.eventType !== "INTENT_CREATED" && event.eventType !== "ORDER_SUBMITTED") return event;
    if (typeof event.payload.idempotencyKey === "string" && event.payload.idempotencyKey.length > 0) return event;
    return RuntimeEventSchema.parse({
      ...event,
      payload: {
        ...event.payload,
        idempotencyKey: this.orderSubmissionKey(event)
      }
    });
  }

  private async applyTruthConfidenceOrderGovernance(event: RuntimeEvent): Promise<RiskDecision> {
    this.refreshTruthConfidence();
    this.auditDecision({
      action: "truth_confidence_evaluated",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId,
      symbol: event.symbol,
      reason: this.truthConfidence.reason,
      value: this.truthConfidence.positionSizeMultiplier,
      metrics: {
        confidence: this.truthConfidence.confidence,
        haltNewOrders: this.truthConfidence.haltNewOrders
      }
    });
    if (this.truthConfidence.enterSafeMode) {
      await this.enterSafeMode(event, "unknown_truth_state");
      return { allow: false, reason: "unknown_truth_state" };
    }
    if (this.truthConfidence.haltNewOrders) {
      this.auditDecision({
        action: "event_rejected",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        symbol: event.symbol,
        reason: "disputed_truth_halts_new_orders"
      });
      return { allow: false, reason: "disputed_truth_halts_new_orders" };
    }
    if (this.truthConfidence.positionSizeMultiplier < 1 && typeof event.payload.quantity === "number") {
      const reducedQuantity = event.payload.quantity * this.truthConfidence.positionSizeMultiplier;
      event.payload.quantity = reducedQuantity;
      this.auditDecision({
        action: "position_size_reduced",
        seq: event.seq,
        eventType: event.eventType,
        correlationId: event.correlationId,
        symbol: event.symbol,
        value: reducedQuantity,
        reason: "degraded_truth_confidence"
      });
    }
    return { allow: true };
  }

  private refreshTruthConfidence(): void {
    this.truthConfidence = truthConfidenceState({
      causalUncertaintyCount: this.causalUncertaintyCount,
      confidenceDowngradeCount: this.confidenceDowngradeCount,
      disputed: this.disputedTruth,
      unknown: this.unknownTruth
    });
  }

  private sequenceIdFromPayload(payload: Record<string, unknown>): number | undefined {
    const value = payload.sequence_id ?? payload.sequenceId ?? payload.updateId ?? payload.tradeId;
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }

  private canBypassDuplicateChecks(options: IngestOptions): boolean {
    return options.bypassDuplicateChecks === true && this.state.mode() === "REPLAY";
  }

  private assertEventIdempotent(event: RuntimeEvent, bypassDuplicateChecks: boolean): void {
    if (bypassDuplicateChecks) return;
    if (this.seenSeq.has(event.seq)) {
      throw new Error(`duplicate_seq:${event.seq}`);
    }
    if (event.eventId !== undefined && this.seenEventIds.has(event.eventId)) {
      throw new Error(`duplicate_event_id:${event.eventId}`);
    }
  }

  private assertOrderSubmissionIdempotent(event: RuntimeEvent, bypassDuplicateChecks: boolean): void {
    if (bypassDuplicateChecks) return;
    const key = this.orderSubmissionKey(event);
    if (this.submittedOrderKeys.has(key)) {
      throw new Error(`duplicate_order_submission:${key}`);
    }
  }

  private markEventAccepted(event: RuntimeEvent, bypassDuplicateChecks: boolean): void {
    if (bypassDuplicateChecks) return;
    this.seq = Math.max(this.seq, event.seq);
    this.seenSeq.add(event.seq);
    if (event.eventId !== undefined) {
      this.seenEventIds.add(event.eventId);
    }
  }

  private orderSubmissionKey(event: RuntimeEvent): string {
    return `${event.correlationId}:${event.causationId}`;
  }

  private auditDuplicateRejection(event: RuntimeEvent, reason: string): void {
    this.auditDecision({
      action: "event_rejected",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId,
      reason
    });
  }

  private reconcilePortfolio(event: RuntimeEvent): RiskDecision {
    if (event.eventType === "ORDER_FILLED") {
      const expectedPosition = this.positionQuantity(event);
      if (expectedPosition !== undefined) {
        this.expectedPositions.set(event.symbol, expectedPosition);
      }
      return { allow: true };
    }

    if (event.eventType !== "POSITION_UPDATED") {
      return { allow: true };
    }

    const expectedPosition = this.expectedPositions.get(event.symbol);
    const actualPosition = this.positionQuantity(event);
    if (expectedPosition === undefined || actualPosition === undefined || Object.is(expectedPosition, actualPosition)) {
      return { allow: true };
    }

    const reason = "position_mismatch";
    this.auditDecision({
      action: "position_mismatch",
      seq: event.seq,
      eventType: event.eventType,
      correlationId: event.correlationId,
      symbol: event.symbol,
      expectedPosition,
      actualPosition,
      reason
    });
    return this.risk.halt(reason);
  }

  private positionQuantity(event: RuntimeEvent): number | undefined {
    const quantity = Number(event.payload.quantity);
    return Number.isFinite(quantity) ? quantity : undefined;
  }
}
