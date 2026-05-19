import { AuditLog, type AuditEntry, type AuditSink } from "../audit/audit-log.js";
import {
  BinanceMarketStream,
  normalizeBinanceMarketPayload,
  type BinanceMarketStreamKind,
  type MarketStreamLifecycle
} from "../adapters/binance.js";
import type { EventInput, RuntimeEvent } from "../core/event.js";
import { RuntimeEventSchema } from "../core/event.js";
import { SystemClock } from "../core/clock.js";
import { rootCorrelationId } from "../core/ids.js";
import { ExecutionEngine } from "../execution/execution-engine.js";
import { ConfigSchema, type RuntimeConfig, type RuntimeConfigInput } from "../infra/config.js";
import { AsyncEventBus } from "../infra/event-bus.js";
import type { EventStore } from "../infra/event-store.js";
import { createLogger, type Logger } from "../infra/logger.js";
import { ShutdownController } from "../infra/shutdown.js";
import { SqliteEventStore } from "../infra/sqlite-event-store.js";
import { PortfolioState } from "../portfolio/portfolio-state.js";
import { ReplayEngine, type ReplayMismatch } from "../replay/replay-engine.js";
import { RiskEngine, type RiskDecision, type RiskState } from "../risk/risk-engine.js";
import { RuntimeStateMachine, type RuntimeMode } from "./state-machine.js";

type RuntimeRiskConfig = Pick<
  RuntimeConfig,
  | "runtimeProfile"
  | "logLevel"
  | "sqlitePath"
  | "eventQueueCapacity"
  | "maxQueueDepth"
  | "maxReplayLag"
  | "hotPathWarnMs"
  | "maxExposureUsd"
  | "maxRejectRate"
  | "staleDataHaltMs"
  | "latencyHaltMs"
  | "maxDrawdownUsd"
  | "idempotencyCacheSize"
  | "binanceFuturesWsUrl"
>;

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
  shutdown?: ShutdownController;
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

  private readonly marketStreams: BinanceMarketStream[] = [];

  private shutdownStarted = false;

  private activeIngests = 0;

  private readonly ingestIdleWaiters: Array<() => void> = [];

  private readonly seenSeq: BoundedIdSet<number>;

  private readonly seenEventIds: BoundedIdSet<string>;

  private readonly submittedOrderKeys: BoundedIdSet<string>;

  private readonly expectedPositions = new Map<string, number>();

  private readonly metrics: RuntimeMetrics = {
    eventsProcessed: 0,
    eventsRejected: 0,
    maxQueueDepthObserved: 0,
    lastProcessingLatencyMs: 0,
    maxProcessingLatencyMs: 0,
    replayEventsProcessed: 0,
    replayThroughputEventsPerSecond: 0,
    safeModeCount: 0,
    websocketReconnectCount: 0
  };

  public readonly events: AsyncEventBus;

  public readonly execution: ExecutionEngine;

  public readonly portfolio: PortfolioState;

  public readonly replay: ReplayEngine;

  public readonly risk: RiskEngine;

  public readonly shutdown: ShutdownController;

  public readonly state = new RuntimeStateMachine();

  public readonly checkpoints = new CheckpointManager();

  constructor(private readonly deps?: RuntimeDeps) {
    this.config = ConfigSchema.parse(deps?.config ?? {});
    this.logger = deps?.logger ?? createLogger(this.config);
    this.events = deps?.eventBus ?? new AsyncEventBus(this.config.eventQueueCapacity);
    this.eventStore = deps?.eventStore ?? new SqliteEventStore(this.config.sqlitePath);
    this.audit = deps?.audit ?? new AuditLog(this.logger);
    this.seenSeq = new BoundedIdSet<number>(this.config.idempotencyCacheSize);
    this.seenEventIds = new BoundedIdSet<string>(this.config.idempotencyCacheSize);
    this.submittedOrderKeys = new BoundedIdSet<string>(this.config.idempotencyCacheSize);
    this.portfolio = deps?.portfolio ?? new PortfolioState();
    this.replay = deps?.replay ?? new ReplayEngine();
    this.risk = deps?.risk ?? new RiskEngine(this.config, this.portfolio);
    this.execution = deps?.execution ?? new ExecutionEngine(this.risk);
    this.shutdown = deps?.shutdown ?? new ShutdownController();
    this.shutdown.onShutdown(async () => {
      await this.waitForIngestIdle();
      await this.events.drain();
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

    this.running = true;
    this.auditDecision({
      action: "runtime_started",
      runtimeProfile: this.config.runtimeProfile,
      limits: this.auditLimits()
    });
    this.timer = setInterval(() => {
      this.reportRuntimeHealth();
    }, TradingRuntime.HEALTH_REPORT_INTERVAL_MS);
    this.timer.unref?.();

    console.log("runtime.start()");
  }

  async stop(): Promise<void> {
    this.shutdownStarted = true;
    this.running = false;

    for (const stream of this.marketStreams) {
      stream.close();
    }
    this.marketStreams.length = 0;

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
    if (this.shutdownStarted || this.state.mode() === "STOPPING" || this.state.mode() === "HALTED") {
      this.auditDecision({ action: "event_rejected", reason: "runtime_shutdown" });
      throw new Error("runtime_shutdown");
    }
    this.assertQueueDepthAllowsIngest(input);

    const startedAt = Date.now();
    let event: RuntimeEvent | undefined;
    this.activeIngests += 1;
    try {
      event = await this.ingestAccepted(input, options);
    } finally {
      this.activeIngests -= 1;
      this.resolveIngestIdleIfDrained();
    }
    await this.observeProcessingLatency(Date.now() - startedAt, event);
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

    const bypassDuplicateChecks = this.canBypassDuplicateChecks(options);
    try {
      this.assertEventIdempotent(event, bypassDuplicateChecks);
    } catch (error) {
      this.auditDuplicateRejection(event, error instanceof Error ? error.message : "duplicate_event");
      throw error;
    }

    if (event.eventType === "INTENT_CREATED") {
      try {
        this.assertOrderSubmissionIdempotent(event, bypassDuplicateChecks);
      } catch (error) {
        this.auditDuplicateRejection(event, error instanceof Error ? error.message : "duplicate_order_intent");
        throw error;
      }
      const decision = this.risk.evaluateIntent(event, Date.now());
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
      this.portfolio.apply(event);
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
        Date.now()
      );
      if (!result.accepted && result.events.length === 0) {
        this.saveCheckpoint();
        return event;
      }
      for (const producedEvent of result.events) {
        if (producedEvent.eventType === "ORDER_SUBMITTED") {
          this.auditDecision({
            action: "dry_run_order_submitted_generated",
            seq: producedEvent.seq,
            eventType: producedEvent.eventType,
            correlationId: producedEvent.correlationId
          });
        }
        await this.publishAccepted(producedEvent);
        this.risk.observe(producedEvent);
      }
      if (result.events.some((producedEvent) => producedEvent.eventType === "ORDER_SUBMITTED")) {
        this.submittedOrderKeys.add(this.orderSubmissionKey(event));
      }
    }

    this.saveCheckpoint();
    return event;
  }

  replayPersisted(fromSeq = 1, limit = 10_000): ReplayMismatch[] {
    this.auditDecision({ action: "replay_started", seq: fromSeq });
    const previousMode = this.state.mode();
    try {
      if (previousMode !== "REPLAY") {
        this.state.transition("REPLAY");
      }
      const startedAt = Date.now();
      const events = this.eventStore.readFrom(fromSeq, limit);
      this.observeReplayThroughput(events.length, Date.now() - startedAt);
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
      websocketReconnectCount: this.metrics.websocketReconnectCount
    };
  }

  connectBinanceMarketData(symbol: string): void {
    const stream = new BinanceMarketStream(
      this.config,
      new SystemClock(),
      this.logger,
      (event) => this.ingestExternalMarketEvent(event),
      (event) => this.handleMarketStreamLifecycle(event)
    );
    stream.connectBookTicker(symbol);
    stream.connectTrades(symbol);
    stream.connectMarkPrice(symbol);
    this.marketStreams.push(stream);
  }

  async ingestBinanceMarketPayload(
    stream: BinanceMarketStreamKind,
    symbol: string,
    payload: Record<string, unknown>,
    receiveTimestamp = Date.now()
  ): Promise<void> {
    try {
      await this.ingestExternalMarketEvent(normalizeBinanceMarketPayload(stream, symbol, payload, receiveTimestamp));
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
    await this.ingest(input);
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

  private toRuntimeEvent(input: EventInput): RuntimeEvent {
    const now = Date.now();
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
    const now = Date.now();
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
    this.auditDecision({
      action: "runtime_health_report",
      metrics: this.healthSnapshot() as unknown as Record<string, unknown>
    });
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
      idempotencyCacheSize: this.config.idempotencyCacheSize
    };
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
