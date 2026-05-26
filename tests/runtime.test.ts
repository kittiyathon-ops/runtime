import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { TradingRuntime } from "../src/runtime/runtime.js";
import { resolveConflict, type AuthoritativeState } from "../src/arbitration/exchange-state-authority.js";
import { PayloadTrustScorer } from "../src/bridge/PayloadTrustScoring.js";
import { RequestGovernor } from "../src/bridge/RequestGovernor.js";
import { RestApiGovernor } from "../src/bridge/RestApiGovernor.js";
import { ExchangePayloadGuard } from "../src/bridge/ExchangePayloadGuard.js";
import { WebSocketSequenceIntegrity } from "../src/bridge/WebSocketSequenceIntegrity.js";
import { SurvivabilityProvider } from "../src/core/SurvivabilityProvider.js";
import { StartupTruthReconciler } from "../src/core/StartupTruthReconciler.js";
import { StateManager } from "../src/core/StateManager.js";
import { PrecisionMath } from "../src/infrastructure/PrecisionMath.js";
import { OperationalMetricsRecorder } from "../src/metrics/index.js";
import {
  SimpleTrendFollowingStrategy as OperationalSimpleTrendFollowingStrategy,
  type SimpleTrendFollowingConfig
} from "../src/strategies/simple-trend-following.js";
import { SimpleTrendFollowingStrategy, type SimpleTrendStrategyConfig } from "../src/strategies/simple-trend-strategy.js";
import { RuntimeSessionLock } from "../src/infra/RuntimeSessionLock.js";
import { OperationalBootstrap, deploymentModeFromEnv, symbolsFromEnv, type RuntimeFeedConnector } from "../src/main.js";
import { TelegramNotifier, type AlertNotifier } from "../src/alerts/telegram-notifier.js";
import { ManualClock } from "../src/infra/clock.js";
import { HealthMonitor } from "../src/infra/health-monitor.js";
import { IdempotencyCache } from "../src/infra/idempotency-cache.js";
import { MetricsRegistry } from "../src/infra/metrics.js";
import { RetryPolicy } from "../src/infra/retry-policy.js";
import { SqliteEventStore } from "../src/infra/sqlite-event-store.js";
import { getMessages, normalizeTelegramLanguage } from "../src/i18n/index.js";
import { normalizeAlertMode } from "../src/notifications/alert-mode.js";
import { AlertAggregator } from "../src/notifications/alert-aggregator.js";
import { AlertDeduplicator } from "../src/notifications/alert-deduplicator.js";
import { dashboardMetadataForSeverity } from "../src/notifications/alert-dashboard-metadata.js";
import { AlertRouter } from "../src/notifications/alert-router.js";
import { EMOJI, severityEmoji, tagEmoji } from "../src/notifications/emoji-map.js";
import { buildTelegramAlert } from "../src/notifications/telegram-alert-builder.js";
import { formatPositionClosed, formatUsd } from "../src/notifications/telegram-formatter.js";
import { RuntimeReplayEngine } from "../src/runtime/replay-engine.js";
import { RuntimeStateMachine, transitionRule } from "../src/runtime/state-machine.js";
import {
  DeterministicRestartCoordinator,
  EventLoopLagMonitor,
  GcPauseInstrumentation,
  ProcessSurvivabilityMonitor
} from "../src/runtime/process-survivability.js";
import { configFingerprint } from "../src/runtime/config-fingerprint.js";
import { truthConfidenceState } from "../src/runtime/truth-confidence.js";
import { OperatorOverrideLedger } from "../src/oversight/operator-override-ledger.js";
import { MemoryEventSource } from "../src/runtime/event-source.js";
import { EventSchemaRegistry } from "../src/contracts/event-schema-registry.js";
import { BinanceEventNormalizer } from "../src/adapters/binance/binance-event-normalizer.js";
import { BinanceWebsocket } from "../src/adapters/binance/binance-websocket.js";
import { BinanceMarketStream } from "../src/adapters/binance.js";
import { normalizeBinanceMarketPayloadForAdapter } from "../src/adapters/binance-market-data-adapter.js";
import { RiskGovernor } from "../src/runtime/risk-governor.js";
import { ExecutionKernel } from "../src/runtime/execution-kernel.js";
import { PortfolioStateEngine } from "../src/runtime/portfolio-state-engine.js";
import { PortfolioReconstructionEngine } from "../src/runtime/portfolio-reconstruction-engine.js";
import { RuntimeJournal } from "../src/runtime/runtime-journal.js";
import { RuntimeTimeline } from "../src/runtime/runtime-timeline.js";
import { GovernanceStateMachine } from "../src/runtime/governance-state-machine.js";
import { SnapshotManager, MemorySnapshotStore } from "../src/runtime/snapshot-manager.js";
import { RecoveryManager, type RecoveryEventSource } from "../src/runtime/recovery-manager.js";
import { RuntimeConsensus } from "../src/runtime/runtime-consensus.js";
import { RuntimeConsensusGovernanceOrchestrator } from "../src/runtime/runtime-consensus-orchestrator.js";
import { ShadowRuntime } from "../src/runtime/shadow-runtime.js";
import { buildPortfolioSummary, buildPnlSummary } from "../src/dashboard/dashboard-pnl-view.js";
import { buildEdgeAttributionSection, buildRuntimeStateGraph } from "../src/dashboard/dashboard-runtime-view.js";
import { buildTimelineView } from "../src/dashboard/dashboard-timeline-view.js";
import { buildConsensusStatus, buildRecoveryStatus, buildReplayStatus } from "../src/dashboard/dashboard-replay-view.js";
import {
  EdgeConsensus,
  EdgeDegradationPolicy,
  EdgeGovernanceOrchestrator,
  EdgeHealthMonitor,
  EdgeLatencyTracker,
  EdgePartitionDetector,
  EdgeTrustEvaluator,
  edgeEvent
} from "../src/edge/index.js";
import {
  BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_REST_URL,
  BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_WS_API_URL,
  ConfigSchema,
  RUNTIME_PROFILE_LIMITS,
  validateBinanceEndpointMode,
  type RuntimeConfig,
  type RuntimeProfile
} from "../src/infra/config.js";
import { createLogger } from "../src/infra/logger.js";
import { RuntimeEventSchema, type EventInput, type RuntimeEvent } from "../src/core/event.js";
import {
  BinanceRest,
  BinanceRestError,
  type BinanceAccountBalance,
  type BinanceFetch,
  type BinanceExchangeInfo,
  type BinanceOpenOrder,
  type BinanceOrderRequest,
  type BinanceOrderResponse,
  type BinancePositionRisk
} from "../src/adapters/binance/binance-rest.js";
import {
  MainnetTinyRefusal,
  executeMainnetCancel,
  executeMainnetTinyOrder,
  type MainnetTinyEnv,
  type MainnetTinyRest
} from "../src/live-execution/mainnet-tiny-order.js";
import { BackpressureHandler, CpuBudget, MemoryBudget, NetworkBudget, RateLimitEngine } from "../src/budget/index.js";
import {
  AuthorityBoundaries,
  ConstitutionalAuditLog,
  ConstitutionalValidator,
  NON_OVERRIDABLE_RULES,
  RUNTIME_RIGHTS,
  constitutionalBreach,
  constitutionalInvariant
} from "../src/constitution/index.js";
import {
  CapabilityRegistry,
  ExecutionScopeValidator,
  IsolationBoundaries,
  MutationAuthorityValidator,
  SandboxPolicy
} from "../src/capability/index.js";
import {
  ObservabilityAlertRules,
  ObservabilityAuditLog,
  ObservabilityMetricsCollector,
  PerformanceBudgetEvaluator,
  TracingSpanRecorder
} from "../src/observability/index.js";
import {
  EmergencyStop,
  GracefulDegradationPolicy,
  QuarantineReleaseProtocol,
  RollbackEngine,
  SafeStateTransitionProtocol
} from "../src/recovery/index.js";
import {
  CausalOrderValidator,
  CausalityWindow,
  MonotonicClock,
  ReplayDriftDetector,
  TemporalValidator,
  TimelineLock
} from "../src/temporal/index.js";
import {
  CausalityValidator,
  GovernanceProofBuilder,
  InvariantChecker,
  ReplayConsistencyVerifier,
  StateMachineVerifier,
  TransitionSafetyVerifier
} from "../src/verification/index.js";
import {
  CausalExplainer,
  ConfidenceExplainer,
  EvidenceChainBuilder,
  GovernanceReasoningBuilder,
  RuntimeJustificationBuilder,
  SemanticTimeline,
  TransitionExplainer
} from "../src/explainability/index.js";
import {
  GovernanceLineage,
  IdentityAttestor,
  IdentityCoherenceCheck,
  IdentityDriftDetector,
  MutationHistory,
  PolicyLineage,
  continuityHash,
  doctrineVersion,
  identityFingerprint,
  invariantFingerprint,
  runtimeIdentity
} from "../src/identity/index.js";
import {
  AdversarialRuntime,
  capabilityEscalationScenario,
  confidenceSpoofingScenario,
  delayedTruthInjectionScenario,
  fakeRealityScenario,
  forgedProvenanceScenario,
  governancePoisoningScenario,
  identityDriftAttackScenario,
  quarantineBypassScenario,
  replayDivergenceScenario,
  staleValidObservationScenario,
  temporalCorruptionScenario,
  timelineDesynchronizationScenario
} from "../src/simulation/index.js";
import {
  SurvivabilityIndexEvaluator,
  adaptationPressure,
  coherenceDecay,
  contradictionDensity,
  epistemicStress,
  governanceSaturation,
  identityInstability,
  operationalFatigue,
  trustFracture,
  uncertaintyPressure
} from "../src/cognitive-pressure/index.js";
import {
  ComplexityCollapseDetector,
  ComplexitySemanticCompression,
  InstabilityThreshold,
  RecursionGuard,
  RecursionDetector,
  causalDepthBudget,
  causalDepth,
  cognitiveLoad,
  complexityBudget,
  contradictionBudget,
  explainabilityBudget,
  governanceLoad,
  governanceLoadBudget,
  oversightPressure,
  semanticDensity,
  StabilizationEngine,
  unresolvedPressure
} from "../src/complexity/index.js";
import {
  DoctrineConsistency,
  GovernanceAudit,
  LegitimacyEvaluator,
  constitutionalPressure,
  governanceDrift,
  overrideAnalysis,
  policyStability
} from "../src/meta-governance/index.js";
import {
  SemanticCompressor,
  causalSummarizer,
  contradictionClustering,
  evidenceCompaction,
  governanceSummary,
  replayCompression,
  timelineAbstraction
} from "../src/semantic-compression/index.js";
import {
  OperationalRealityLock,
  confidenceCollapse,
  epistemicContamination,
  fragmentationPressure,
  integrityAttestation,
  realityFracture,
  realityIntegrityScore,
  semanticDriftDetector,
  truthCorruption
} from "../src/reality-integrity/index.js";
import {
  constitutionalFatigue,
  constitutionalIntegrity,
  constitutionalRecursion,
  doctrinalConsistency,
  doctrineErosion,
  governanceCoherence,
  legitimacyAttestation,
  legitimacyPressure
} from "../src/constitutional-cognition/index.js";
import {
  conflictingTruths,
  consensusAttestation,
  disputedWorlds,
  operationalConsensus,
  parallelReality,
  probabilisticCausality,
  probabilisticTimeline,
  realityWeighting,
  timelineDivergence
} from "../src/multi-reality/index.js";
import {
  CorruptionQuarantine,
  ImmuneMemory,
  anomalyAntibodies,
  cognitiveInfection,
  epistemicPathogens,
  governanceAutoimmune,
  immuneAttestation,
  selfNonself,
  survivabilityResponse
} from "../src/immune/index.js";
import {
  ContinuityLineage,
  ExistentialMemory,
  continuityAttestation,
  continuityCollapse,
  existentialBoundary,
  existentialDrift,
  existentialIntegrity,
  identityPersistence,
  selfPreservationDoctrine
} from "../src/existential/index.js";
import {
  SemanticLineage,
  conceptualContinuity,
  doctrineSemantics,
  interpretiveDrift,
  meaningCollapse,
  meaningIntegrity,
  recursiveMeaning,
  semanticAttestation,
  semanticIdentity
} from "../src/meaning/index.js";
import {
  authorityContinuity,
  authorityFracture,
  constitutionalRecursion as sovereignConstitutionalRecursion,
  constitutionalSurvival,
  governanceLegitimacy,
  legitimacyRecursion,
  sovereignAttestation,
  sovereignIntegrity,
  sovereigntyBoundary
} from "../src/sovereignty/index.js";
import {
  CivilizationalMemory,
  CivilizationLineage,
  agentSocieties,
  civilizationIntegrity,
  constitutionalNegotiation,
  doctrinePluralism,
  ideologicalConflict,
  interAgentGovernance,
  operationalDiplomacy
} from "../src/civilization/index.js";
import {
  cognitiveEntropy,
  coherenceEnergy,
  collapseProximity,
  entropyPressure,
  equilibriumEngine,
  recursiveHeat,
  stabilizationCost,
  survivabilityEnergy,
  thermodynamicAttestation,
  thermodynamicBudget
} from "../src/thermodynamics/index.js";
import * as Kernel from "../src/kernel/index.js";
import * as Compression from "../src/compression/index.js";
import * as Arbitration from "../src/arbitration/index.js";
import * as Metastability from "../src/metastability/index.js";
import * as Mortality from "../src/mortality/index.js";
import * as Convergence from "../src/convergence/index.js";
import * as Simplicity from "../src/simplicity/index.js";
import * as Field from "../src/field/index.js";
import * as AdaptiveImmune from "../src/adaptive-immune/index.js";
import * as Economy from "../src/economy/index.js";
import * as ContinuousAdversarial from "../src/adversarial-runtime/index.js";
import * as FormalInvariants from "../src/invariants/index.js";
import * as Adaptation from "../src/adaptation/index.js";
import * as SelfDoubt from "../src/self-doubt/index.js";
import * as Survivability from "../src/survivability/index.js";
import * as OperatorProtection from "../src/operator/index.js";
import * as EntropyControl from "../src/entropy/index.js";
import * as ReplayValidation from "../src/replay-validation/index.js";
import * as Degradation from "../src/degradation/index.js";
import * as Certification from "../src/certification/index.js";
import * as LivePressure from "../src/live-pressure/index.js";
import * as MinimalKernel from "../src/minimal-kernel/index.js";
import * as SemanticCompressionPass from "../src/semantic-compression-pass/index.js";
import * as ColdStart from "../src/cold-start/index.js";
import * as TimeHorizon from "../src/time-horizon/index.js";
import * as Profiling from "../src/profiling/index.js";
import * as ReplayCertification from "../src/replay-certification/index.js";
import * as MinimalSurvivability from "../src/minimal-survivability/index.js";
import * as Deployment from "../src/deployment/index.js";
import * as BurnIn from "../src/burn-in/index.js";
import * as OntologyHygiene from "../src/ontology-hygiene/index.js";
import * as KernelCore from "../src/kernel-core/index.js";
import * as SemanticSurface from "../src/semantic-surface/index.js";
import * as ReplayCompression from "../src/replay-compression/index.js";
import * as Minimalism from "../src/minimalism/index.js";
import * as LongHorizon from "../src/long-horizon/index.js";
import * as Incidents from "../src/incidents/index.js";
import * as Scars from "../src/scars/index.js";
import * as OperatorDashboard from "../src/operator-dashboard/index.js";
import * as RealityContact from "../src/reality-contact/index.js";
import * as LiveExecution from "../src/live-execution/index.js";
import * as OperatorEscalation from "../src/operator-escalation/index.js";
import * as LiveReadiness from "../src/live-readiness/index.js";
import {
  EmergencyInterventionWorkflow,
  ExplainabilityViewBuilder,
  GovernanceOverrideWorkflow,
  ManualApprovalWorkflow,
  RuntimeInspection
} from "../src/oversight/index.js";
import { RealityGraph } from "../src/reality/index.js";
import type { AuditEntry, AuditRecord } from "../src/audit/audit-log.js";
import { ExecutionEngine } from "../src/execution/execution-engine.js";
import { PaperPerformanceTracker } from "../src/execution/paper-performance-tracker.js";
import { PortfolioState } from "../src/portfolio/portfolio-state.js";
import { RiskEngine } from "../src/risk/risk-engine.js";
import {
  CompositeSignalToIntentPolicy,
  SignalEngine,
  SpreadWideningSignalProvider,
  type SignalProvider,
  type SignalToIntentPolicy
} from "../src/signals/signal-engine.js";

class MemoryEventStore {
  readonly events: RuntimeEvent[] = [];
  closeCount = 0;

  append(event: RuntimeEvent): void {
    this.events.push(event);
  }

  readFrom(seq: number, limit: number): RuntimeEvent[] {
    return this.events.filter((event) => event.seq >= seq).slice(0, limit);
  }

  close(): void {
    this.closeCount += 1;
  }
}

class MemoryAuditLog {
  readonly records: AuditRecord[] = [];

  record(record: AuditRecord): void {
    this.records.push(record);
  }

  entries(action: string): AuditEntry[] {
    return this.records.filter((record): record is AuditEntry => "action" in record && record.action === action);
  }
}

class MemoryNotifier implements AlertNotifier {
  readonly messages: string[] = [];

  async sendAlert(message: string): Promise<void> {
    this.messages.push(message);
  }
}

class FailingNotifier implements AlertNotifier {
  attempts = 0;

  async sendAlert(_message: string): Promise<void> {
    this.attempts += 1;
    throw new Error("telegram_down");
  }
}

class MemoryRuntimeFeedConnector implements RuntimeFeedConnector {
  readonly actions: string[] = [];
  marketHealthy = true;
  userHealthy = true;

  async connectMarketFeeds(symbols: readonly string[]): Promise<void> {
    this.actions.push(`market:${symbols.join(",")}`);
  }

  async connectUserStream(symbols: readonly string[]): Promise<void> {
    this.actions.push(`user:${symbols.join(",")}`);
  }

  close(): void {
    this.actions.push("close");
  }

  healthy(): boolean {
    return this.marketHealthy && this.userHealthy;
  }
}

class RecordingLiveExecution extends LiveExecution.BinanceLiveExecution {
  readonly submittedOrders: RuntimeEvent[] = [];
  closeCount = 0;

  constructor(options: LiveExecution.BinanceLiveExecutionOptions = {}) {
    super(() => undefined, () => undefined, options);
  }

  override async submitOrder(event: RuntimeEvent): Promise<void> {
    await super.submitOrder(event);
    this.submittedOrders.push(event);
  }

  override close(): void {
    this.closeCount += 1;
    super.close();
  }
}

class MockBinanceRest extends BinanceRest {
  readonly newOrders: BinanceOrderRequest[] = [];
  exchangeInfoCalls = 0;
  positionRiskCalls = 0;
  accountBalanceCalls = 0;
  openOrdersCalls = 0;
  newOrderError?: unknown;
  exchangeInfoError?: unknown;
  positionRiskError?: unknown;
  positionRiskResponse: ReturnType<BinanceRest["positionRisk"]> extends Promise<infer T> ? T : never = [{ symbol: "BTCUSDT", positionAmt: "0", entryPrice: "0", markPrice: "0", notional: "0", leverage: "1", unrealizedProfit: "0" }];
  accountBalanceResponse: ReturnType<BinanceRest["accountBalance"]> extends Promise<infer T> ? T : never = [];
  openOrdersResponse: ReturnType<BinanceRest["openOrders"]> extends Promise<infer T> ? T : never = [];
  exchangeInfoResponse: BinanceExchangeInfo = {
    symbols: [{
      symbol: "BTCUSDT",
      status: "TRADING",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.10" },
        { filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001", maxQty: "100" },
        { filterType: "MIN_NOTIONAL", minNotional: "5" }
      ]
    }]
  };

  constructor() {
    super({ baseUrl: "https://demo-fapi.binance.com", apiKey: "test_key", apiSecret: "test_secret" });
  }

  override async exchangeInfo(): Promise<BinanceExchangeInfo> {
    this.exchangeInfoCalls += 1;
    if (this.exchangeInfoError !== undefined) throw this.exchangeInfoError;
    return this.exchangeInfoResponse;
  }

  override async positionRisk(): Promise<ReturnType<BinanceRest["positionRisk"]> extends Promise<infer T> ? T : never> {
    this.positionRiskCalls += 1;
    if (this.positionRiskError !== undefined) throw this.positionRiskError;
    return this.positionRiskResponse;
  }

  override async accountBalance(): Promise<ReturnType<BinanceRest["accountBalance"]> extends Promise<infer T> ? T : never> {
    this.accountBalanceCalls += 1;
    return this.accountBalanceResponse;
  }

  override async openOrders(): Promise<ReturnType<BinanceRest["openOrders"]> extends Promise<infer T> ? T : never> {
    this.openOrdersCalls += 1;
    return this.openOrdersResponse;
  }

  override async newOrder(order: BinanceOrderRequest): Promise<BinanceOrderResponse> {
    this.newOrders.push(order);
    if (this.newOrderError !== undefined) throw this.newOrderError;
    return {
      symbol: order.symbol,
      orderId: 123,
      clientOrderId: order.newClientOrderId,
      transactTime: 1_700_000_000_010,
      status: "NEW",
      origQty: order.quantity,
      price: order.price ?? "0",
      side: order.side,
      type: order.type
    };
  }
}

function eventWithSeq(seq: number, eventId?: string): RuntimeEvent {
  return {
    ...(eventId === undefined ? {} : { eventId }),
    seq,
    timestamp: 1_700_000_000_000 + seq,
    receiveTimestamp: 1_700_000_000_000 + seq,
    processingTimestamp: 1_700_000_000_000 + seq,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_replay",
    causationId: "test",
    payload: { bid: 100 + seq, ask: 101 + seq }
  };
}

function eventInputWithSeq(seq: number, eventId?: string): EventInput {
  return {
    ...(eventId === undefined ? {} : { eventId }),
    seq,
    timestamp: 1_700_000_000_000 + seq,
    receiveTimestamp: 1_700_000_000_000 + seq,
    processingTimestamp: 1_700_000_000_000 + seq,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_replay_bypass",
    causationId: "test",
    payload: { bid: 100 + seq, ask: 101 + seq }
  };
}

const baseConfig: RuntimeConfig = {
  nodeEnv: "test",
  runtimeProfile: "DEVELOPMENT",
  logLevel: "silent",
  sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite"),
  dryRun: true,
  eventQueueCapacity: 100,
  maxQueueDepth: 100,
  maxReplayLag: 100,
  hotPathWarnMs: 20,
  staleDataHaltMs: 1_000,
  latencyHaltMs: 250,
  maxRejectRate: 0.5,
  maxExposureUsd: 10_000,
  maxDailyLossUsd: 100,
  maxOrderNotionalUsd: 10,
  maxLeverage: 1,
  maxDrawdownUsd: 1_000,
  idempotencyCacheSize: 100,
  maxReorderWindowMs: 0,
  clockSkewAlertMs: 1_000,
  paperFillSimulationEnabled: false,
  paperFillSlippageBps: 0,
  telegramAlertsEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  telegramLanguage: "en",
  telegramAlertMode: "verbose",
  liveTradingConfirmation: "",
  allowMarketOrders: false,
  killSwitch: false,
  binanceSymbols: ["BTCUSDT"],
  binanceUseTestnet: true,
  binanceFuturesRestUrl: "https://demo-fapi.binance.com",
  binanceFuturesUserStreamBaseUrl: "wss://stream.binancefuture.com",
  binanceFuturesMarketWsBaseUrl: "wss://stream.binancefuture.com",
  binanceFuturesWsApiUrl: "wss://testnet.binancefuture.com/ws-fapi/v1",
  binanceApiKey: "",
  binanceApiSecret: ""
};

const liveTestConfig: RuntimeConfig = {
  ...baseConfig,
  runtimeProfile: "LIVE",
  dryRun: false,
  liveTradingConfirmation: "I_UNDERSTAND_THIS_TRADES_REAL_MONEY",
  allowMarketOrders: false,
  binanceUseTestnet: false,
  binanceFuturesRestUrl: BINANCE_FUTURES_PRODUCTION_REST_URL,
  binanceFuturesUserStreamBaseUrl: BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL,
  binanceFuturesMarketWsBaseUrl: BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL,
  binanceFuturesWsApiUrl: BINANCE_FUTURES_PRODUCTION_WS_API_URL,
  binanceApiKey: "test_key",
  binanceApiSecret: "test_secret",
  maxOrderNotionalUsd: 100,
  maxExposureUsd: 1_000
};

function liveOrderSubmitted(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return RuntimeEventSchema.parse({
    seq: 1,
    timestamp: 1_700_000_000_000,
    receiveTimestamp: 1_700_000_000_000,
    processingTimestamp: 1_700_000_000_000,
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_SUBMITTED",
    correlationId: "corr_live_order",
    causationId: "intent_live_order",
    payload: {
      side: "BUY",
      type: "LIMIT",
      quantity: "0.010",
      limitPrice: "1000.10",
      idempotencyKey: "corr_live_order:1",
      executionMode: "LIVE",
      dailyLossUsd: 0,
      status: "SUBMITTED"
    },
    ...overrides
  });
}

async function refreshLiveExecutionSnapshot(liveExecution: LiveExecution.BinanceLiveExecution): Promise<void> {
  const snapshot = await liveExecution.refreshSurvivabilitySnapshot(["BTCUSDT"], ["ev_test_survivability_snapshot"]);
  assert.equal(snapshot.status, "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY");
}

function profileConfig(runtimeProfile: RuntimeProfile): RuntimeConfig {
  return ConfigSchema.parse({
    nodeEnv: "test",
    runtimeProfile,
    logLevel: "silent",
    sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite")
  });
}

const testSignalToIntentPolicy: SignalToIntentPolicy = {
  id: "test_signal_to_intent_policy",
  evaluate: (signal) => {
    if (signal.payload.signalType !== "SPREAD_WIDENING") {
      return { allow: false, reason: "unsupported_test_signal" };
    }
    return {
      allow: true,
      intent: {
        payload: {
          side: "BUY",
          type: "MARKET",
          quantity: 1,
          topOfBookQuantity: 10,
          reduceOnly: false
        }
      }
    };
  }
};

test("runtime starts in NORMAL and checkpoints ingested market data", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.seq, 1);
  assert.equal(eventStore.events.length, 1);
  assert.equal(eventStore.events[0]?.eventType, "MARKET_TICK");
  assert.equal(RuntimeEventSchema.parse(eventStore.events[0]).seq, 1);
  await runtime.stop();
});

test("audit logs accepted event", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_audit_accept",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  const accepted = audit.entries("event_accepted");
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.seq, 1);
  assert.equal(accepted[0]?.eventType, "MARKET_TICK");
  assert.equal(accepted[0]?.correlationId, "corr_audit_accept");

  await runtime.stop();
});

test("runtime startup audit includes active profile and limits", async () => {
  const audit = new MemoryAuditLog();
  const config = profileConfig("PAPER");
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });

  await runtime.start();

  const started = audit.entries("runtime_started");
  assert.equal(started.length, 1);
  assert.equal(started[0]?.runtimeProfile, "PAPER");
  assert.equal(started[0]?.limits?.latencyHaltMs, RUNTIME_PROFILE_LIMITS.PAPER.latencyHaltMs);
  assert.equal(started[0]?.limits?.idempotencyCacheSize, RUNTIME_PROFILE_LIMITS.PAPER.idempotencyCacheSize);

  await runtime.stop();
});

test("operational bootstrap activates runtime only after deterministic startup gates", async () => {
  const audit = new MemoryAuditLog();
  const feeds = new MemoryRuntimeFeedConnector();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  const sequence: string[] = [];
  const intervals: Array<() => void> = [];
  const bootstrap = new OperationalBootstrap({
    config: baseConfig,
    runtime,
    audit,
    feeds,
    deploymentMode: "PAPER",
    symbols: ["BTCUSDT", "ETHUSDT"],
    verifyReplayIntegrity: () => {
      sequence.push("replay");
      return [];
    },
    verifyStartupReconciliation: () => {
      sequence.push("reconciliation");
      return { allow: true };
    },
    certifyLiveExecution: () => {
      sequence.push("certification");
      return { status: "LIVE_EXECUTION_CERTIFIED", failures: [], evidenceIds: ["ev_live_cert"] };
    },
    setIntervalFn: ((handler: () => void) => {
      intervals.push(handler);
      return { unref: () => undefined } as unknown as NodeJS.Timeout;
    }) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval
  });

  const status = await bootstrap.start();
  intervals[0]?.();

  assert.deepEqual(sequence, ["replay", "reconciliation", "certification"]);
  assert.deepEqual(feeds.actions, ["market:BTCUSDT,ETHUSDT", "user:BTCUSDT,ETHUSDT"]);
  assert.equal(status.runtimeStarted, true);
  assert.equal(status.governanceInitialized, true);
  assert.equal(status.replayVerified, true);
  assert.equal(status.feedsHealthy, true);
  assert.equal(status.liveExecutionCertified, true);
  assert.equal(status.executionEnabled, true);
  assert.equal(runtime.state.mode(), "PAPER");
  assert.equal(audit.entries("operational_runtime_activated").length, 1);
  assert.equal(audit.entries("runtime_heartbeat").length, 1);

  await bootstrap.stop("test_shutdown");
});

test("operational bootstrap fails closed on startup reconciliation mismatch", async () => {
  const audit = new MemoryAuditLog();
  const feeds = new MemoryRuntimeFeedConnector();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });
  const bootstrap = new OperationalBootstrap({
    config: baseConfig,
    runtime,
    audit,
    feeds,
    deploymentMode: "LIVE",
    symbols: ["BTCUSDT"],
    verifyReplayIntegrity: () => [],
    verifyStartupReconciliation: () => ({ allow: false, reason: "startup_reconciliation_mismatch" }),
    certifyLiveExecution: () => { throw new Error("certification_should_not_run"); },
    setIntervalFn: (() => ({ unref: () => undefined }) as unknown as NodeJS.Timeout) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval
  });

  await assert.rejects(bootstrap.start(), /startup_reconciliation_mismatch/);

  assert.equal(runtime.state.mode(), "HALTED");
  assert.equal(feeds.actions.includes("market:BTCUSDT"), false);
  assert.equal(audit.entries("startup_truth_reconciliation_failed").length, 1);
  assert.equal(audit.entries("governance_halt_entered").length, 1);
  assert.equal(audit.entries("operational_bootstrap_failed_closed").length, 1);
  assert.equal(audit.entries("operational_runtime_activated").length, 0);
});

test("operational bootstrap default startup reconciliation fetches exchange truth", async () => {
  const audit = new MemoryAuditLog();
  const feeds = new MemoryRuntimeFeedConnector();
  const rest = new MockBinanceRest();
  const liveExecution = new LiveExecution.BinanceLiveExecution(() => undefined, () => undefined, { config: liveTestConfig, rest });
  const runtime = new TradingRuntime({ config: liveTestConfig, logger: createLogger(liveTestConfig), eventStore: new MemoryEventStore(), audit, liveExecution });
  const bootstrap = new OperationalBootstrap({
    config: liveTestConfig,
    runtime,
    audit,
    feeds,
    deploymentMode: "LIVE",
    symbols: ["BTCUSDT"],
    verifyReplayIntegrity: () => [],
    certifyLiveExecution: () => ({ status: "LIVE_EXECUTION_CERTIFIED", failures: [], evidenceIds: ["ev_live_cert"] }),
    setIntervalFn: (() => ({ unref: () => undefined }) as unknown as NodeJS.Timeout) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval
  });

  await bootstrap.start();

  assert.equal(rest.accountBalanceCalls, 1);
  assert.equal(rest.openOrdersCalls, 1);
  assert.equal(rest.positionRiskCalls, 1);
  assert.equal(audit.entries("startup_reconciliation_verified").length, 1);

  await bootstrap.stop("test_shutdown");
});

test("operational bootstrap blocks activation until live execution is certified and feeds are healthy", async () => {
  const uncertifiedAudit = new MemoryAuditLog();
  const uncertifiedRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit: uncertifiedAudit });
  const uncertified = new OperationalBootstrap({
    config: baseConfig,
    runtime: uncertifiedRuntime,
    audit: uncertifiedAudit,
    feeds: new MemoryRuntimeFeedConnector(),
    deploymentMode: "CONSTRAINED",
    symbols: ["BTCUSDT"],
    verifyReplayIntegrity: () => [],
    verifyStartupReconciliation: () => ({ allow: true }),
    certifyLiveExecution: () => ({ status: "LIVE_EXECUTION_CERTIFICATION_FAILED", failures: ["ghost_order"], evidenceIds: ["ev_fail"] }),
    setIntervalFn: (() => ({ unref: () => undefined }) as unknown as NodeJS.Timeout) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval
  });

  await assert.rejects(uncertified.start(), /startup_live_execution_not_certified:ghost_order/);
  assert.equal(uncertified.snapshot().runtimeStarted, false);
  assert.equal(uncertifiedRuntime.state.mode(), "HALTED");

  const unhealthyAudit = new MemoryAuditLog();
  const unhealthyFeeds = new MemoryRuntimeFeedConnector();
  unhealthyFeeds.marketHealthy = false;
  const unhealthyRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit: unhealthyAudit });
  const unhealthy = new OperationalBootstrap({
    config: baseConfig,
    runtime: unhealthyRuntime,
    audit: unhealthyAudit,
    feeds: unhealthyFeeds,
    deploymentMode: "SHADOW",
    symbols: ["BTCUSDT"],
    verifyReplayIntegrity: () => [],
    verifyStartupReconciliation: () => ({ allow: true }),
    certifyLiveExecution: () => ({ status: "LIVE_EXECUTION_CERTIFIED", failures: [], evidenceIds: ["ev_ok"] }),
    setIntervalFn: (() => ({ unref: () => undefined }) as unknown as NodeJS.Timeout) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval
  });

  await assert.rejects(unhealthy.start(), /startup_market_feeds_unhealthy/);
  assert.equal(unhealthy.snapshot().runtimeStarted, false);
  assert.equal(unhealthyAudit.entries("operational_runtime_activated").length, 0);
});

test("deployment mode and symbol parsing are deterministic", () => {
  assert.equal(deploymentModeFromEnv("LIVE"), "LIVE");
  assert.equal(deploymentModeFromEnv("unknown"), "SHADOW");
  assert.deepEqual(symbolsFromEnv("btcusdt, ethusdt,, "), ["BTCUSDT", "ETHUSDT"]);
  assert.deepEqual(symbolsFromEnv(""), ["BTCUSDT"]);
});

test("invalid config fails startup closed", () => {
  assert.throws(() => {
    new TradingRuntime({
      config: { runtimeProfile: "PAPER", latencyHaltMs: 0 },
      eventStore: new MemoryEventStore()
    });
  }, /Too small|Number must be greater than 0/);
});

test("Telegram alerts fail closed when explicitly enabled without config", () => {
  assert.throws(
    () =>
      ConfigSchema.parse({
        telegramAlertsEnabled: true,
        telegramBotToken: "",
        telegramChatId: "123"
      }),
    /telegram_bot_token_required/
  );
  assert.throws(
    () =>
      ConfigSchema.parse({
        telegramAlertsEnabled: true,
        telegramBotToken: "token",
        telegramChatId: ""
      }),
    /telegram_chat_id_required/
  );
});

test("TelegramNotifier sends alerts with mocked fetch", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const notifier = new TelegramNotifier(
    { telegramAlertsEnabled: true, telegramBotToken: "test_token", telegramChatId: "chat_1" },
    async (url, init) => {
      calls.push({ url, body: init.body });
      return { ok: true, status: 200, text: async () => "ok" };
    }
  );

  await notifier.sendAlert("runtime started");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.telegram.org/bottest_token/sendMessage");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    chat_id: "chat_1",
    text: "runtime started",
    disable_web_page_preview: true
  });
});

test("TelegramNotifier backs off after rate limit response", async () => {
  let calls = 0;
  const notifier = new TelegramNotifier(
    { telegramAlertsEnabled: true, telegramBotToken: "test_token", telegramChatId: "chat_1" },
    async () => {
      calls += 1;
      return { ok: false, status: 429, text: async () => "rate limited" };
    }
  );

  await assert.rejects(notifier.sendAlert("first"), /telegram_send_failed:429/);
  await notifier.sendAlert("second");

  assert.equal(calls, 1);
});

test("Telegram i18n selects Thai English and fallback messages", () => {
  assert.equal(getMessages("th").runtimeStarted, "Runtime เริ่มทำงานแล้ว");
  assert.equal(getMessages("en").runtimeStarted, "Runtime started");
  assert.equal(normalizeTelegramLanguage("jp"), "en");
  assert.equal(getMessages("unknown").runtimeStopped, "Runtime stopped");
});

test("Telegram i18n formats dynamic PnL messages", () => {
  assert.equal(getMessages("th").pnlUpdate(12.345), "PnL ปัจจุบัน: 12.35 USD");
  assert.equal(getMessages("en").dailyPnl(-1.2), "Daily PnL: -1.20 USD");
});

test("Telegram formatter renders Thai closed position summaries", () => {
  const message = formatPositionClosed({
    severity: "INFO",
    primaryTag: "#ORDER",
    language: "th",
    symbol: "SOLUSDT",
    side: "LONG",
    qty: 0.14,
    entry: 85.31,
    exit: 85.11,
    pnl: -0.028,
    pnlPercent: -0.234,
    wins: 2,
    losses: 6,
    totalWinUsd: 0.084,
    totalLossUsd: -0.2,
    sessionTotal: -0.1162,
    orderId: "214996356089"
  });

  assert.equal(message.includes("ปิดสถานะเรียบร้อย"), true);
  assert.equal(message.includes("SOLUSDT"), true);
  assert.equal(message.includes("❌ ขาดทุน"), true);
  assert.equal(message.includes("-0.0280 USDT"), true);
  assert.equal(message.includes("-0.234%"), true);
  assert.equal(message.includes("25.0%"), true);
  assert.equal(message.includes("Order ID:\n214996356089"), true);
  assert.equal(message.split("\n").every((line) => line.length <= 80), true);
});

test("Telegram formatter renders English wins and optional audit fields", () => {
  const message = formatPositionClosed({
    severity: "INFO",
    primaryTag: "#ORDER",
    language: "en",
    symbol: "BTCUSDT",
    side: "SHORT",
    qty: 0.01,
    entry: 70000,
    exit: 69900,
    pnl: 1,
    pnlPercent: 0.143,
    wins: 1,
    losses: 0,
    totalWinUsd: 1,
    totalLossUsd: 0,
    sessionTotal: 1,
    orderId: "paper_1",
    rrRatio: 2.3,
    holdTime: "12m 31s",
    strategyReason: "Liquidity Sweep + FVG",
    runtimeState: "NORMAL"
  });

  assert.equal(message.includes("✅ Position closed"), true);
  assert.equal(message.includes("✅ WIN"), true);
  assert.equal(message.includes("⚖️ RR:\n1 : 2.30"), true);
  assert.equal(message.includes("⏱️ Hold Time:\n12m 31s"), true);
  assert.equal(message.includes("Strategy:\nLiquidity Sweep + FVG"), true);
  assert.equal(message.includes("Runtime:\nNORMAL"), true);
});

test("Telegram alert builder localizes operator alerts and preserves technical terms", () => {
  const safeMode = buildTelegramAlert({
    kind: "safe_mode",
    severity: "CRITICAL",
    primaryTag: "#RUNTIME",
    language: "th",
    reason: "latency spike",
    correlationId: "corr_ops"
  });
  const replay = buildTelegramAlert({
    kind: "replay_divergence",
    severity: "CRITICAL",
    primaryTag: "#REPLAY",
    language: "th",
    reason: "sequence mismatch",
    expectedSeq: 10,
    receivedSeq: 12
  });

  assert.equal(safeMode.includes("ระบบเข้า SAFE MODE"), true);
  assert.equal(safeMode.includes("latency spike"), true);
  assert.equal(replay.includes("REPLAY DIVERGENCE DETECTED"), true);
  assert.equal(replay.includes("sequence mismatch"), true);
});

test("Telegram formatter uses deterministic PnL precision", () => {
  assert.equal(formatUsd(0.084), "0.0840 USDT");
  assert.equal(formatUsd(-0.2), "-0.2000 USDT");
});

test("Telegram alerts render severity and group tags", () => {
  const message = buildTelegramAlert({
    kind: "websocket_disconnected",
    severity: "WARNING",
    primaryTag: "#WS",
    secondaryTags: ["#RUNTIME"],
    language: "en",
    mode: "verbose",
    symbol: "BTCUSDT",
    reason: "websocket_disconnect"
  });

  assert.equal(message.includes("WARNING"), true);
  assert.equal(message.includes("#WS"), true);
  assert.equal(message.includes("#RUNTIME"), true);
  assert.equal(message.includes("WebSocket disconnected"), true);
});

test("Telegram alerts support compact and verbose modes", () => {
  const compact = buildTelegramAlert({
    kind: "order_submitted",
    severity: "INFO",
    primaryTag: "#ORDER",
    language: "en",
    mode: "compact",
    symbol: "BTCUSDT",
    correlationId: "corr_compact",
    seq: 7
  });
  const verbose = buildTelegramAlert({
    kind: "order_submitted",
    severity: "INFO",
    primaryTag: "#ORDER",
    language: "en",
    mode: "verbose",
    symbol: "BTCUSDT",
    correlationId: "corr_verbose",
    seq: 8,
    correlation: { traceId: "corr_verbose", eventId: "ORDER_SUBMITTED:8", orderId: "paper_8", sessionId: "session_a" }
  });

  assert.equal(compact.includes("DRY_RUN ORDER_SUBMITTED"), true);
  assert.equal(compact.includes("seq=7"), false);
  assert.equal(verbose.includes("seq=8"), true);
  assert.equal(verbose.includes("trace_id=corr_verbose"), true);
  assert.equal(verbose.includes("order_id=paper_8"), true);
});

test("Telegram emoji mapping is semantic and centralized", () => {
  assert.equal(severityEmoji("WARNING"), EMOJI.warning);
  assert.equal(severityEmoji("FATAL"), EMOJI.halt);
  assert.equal(tagEmoji("#REPLAY"), EMOJI.replay);
  assert.equal(tagEmoji("#WS"), EMOJI.websocket);
});

test("Telegram replay alerts include forensic sequence details", () => {
  const message = buildTelegramAlert({
    kind: "replay_divergence",
    severity: "CRITICAL",
    primaryTag: "#REPLAY",
    language: "en",
    mode: "verbose",
    reason: "sequence mismatch",
    expectedSeq: 102991,
    receivedSeq: 102995,
    gap: 4,
    eventId: "evt_replay_gap",
    replayCursor: 102990,
    correlation: { traceId: "trace_replay", eventId: "evt_replay_gap", sessionId: "session_replay" }
  });

  assert.equal(message.includes("REPLAY DIVERGENCE DETECTED"), true);
  assert.equal(message.includes("Expected sequence:\n102991"), true);
  assert.equal(message.includes("Received sequence:\n102995"), true);
  assert.equal(message.includes("Gap:\n4 events"), true);
  assert.equal(message.includes("trace_id=trace_replay"), true);
});

test("Telegram missing duplicate and out-of-order sequence alerts are searchable", () => {
  const missing = buildTelegramAlert({
    kind: "missing_sequence",
    severity: "CRITICAL",
    primaryTag: "#REPLAY",
    mode: "compact",
    language: "en",
    reason: "missing seq",
    expectedSeq: 4,
    receivedSeq: 7
  });
  const duplicate = buildTelegramAlert({
    kind: "duplicate_sequence",
    severity: "CRITICAL",
    primaryTag: "#REPLAY",
    mode: "compact",
    language: "en",
    reason: "duplicate seq",
    expectedSeq: 8,
    receivedSeq: 8
  });
  const outOfOrder = buildTelegramAlert({
    kind: "out_of_order_sequence",
    severity: "CRITICAL",
    primaryTag: "#REPLAY",
    mode: "compact",
    language: "en",
    reason: "out-of-order event",
    expectedSeq: 12,
    receivedSeq: 10
  });

  assert.equal(missing.includes("MISSING SEQUENCE DETECTED"), true);
  assert.equal(duplicate.includes("DUPLICATE SEQUENCE DETECTED"), true);
  assert.equal(outOfOrder.includes("OUT-OF-ORDER SEQUENCE DETECTED"), true);
});

test("Telegram alert payloads preserve correlation IDs and are serializable", () => {
  const payload = {
    kind: "safe_mode" as const,
    severity: "CRITICAL" as const,
    primaryTag: "#RUNTIME" as const,
    secondaryTags: ["#RISK" as const],
    language: "th",
    mode: "verbose" as const,
    reason: "risk_limit_hit",
    correlation: {
      traceId: "trace_1",
      eventId: "SAFE_MODE:99",
      orderId: "paper_99",
      sessionId: "session_1"
    }
  };

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
  const message = buildTelegramAlert(payload);
  assert.equal(message.includes("trace_id=trace_1"), true);
  assert.equal(message.includes("event_id=SAFE_MODE:99"), true);
});

test("Telegram alert mode config defaults to verbose and accepts compact", () => {
  assert.equal(normalizeAlertMode(undefined), "verbose");
  assert.equal(normalizeAlertMode("bad"), "verbose");
  assert.equal(normalizeAlertMode("compact"), "compact");
  assert.equal(ConfigSchema.parse({ telegramAlertMode: "compact" }).telegramAlertMode, "compact");
  assert.equal(ConfigSchema.parse({ telegramAlertMode: "invalid" }).telegramAlertMode, "verbose");
});

test("AlertRouter routes alerts by severity", () => {
  const router = new AlertRouter();
  const info = router.route({
    kind: "runtime_started",
    severity: "INFO",
    primaryTag: "#RUNTIME",
    language: "en",
    mode: "verbose"
  });
  const warning = router.route({
    kind: "websocket_reconnecting",
    severity: "WARNING",
    primaryTag: "#WS",
    language: "en",
    reason: "websocket_disconnect"
  });
  const critical = router.route({
    kind: "safe_mode",
    severity: "CRITICAL",
    primaryTag: "#RUNTIME",
    secondaryTags: ["#RISK"],
    language: "en",
    reason: "risk_limit_hit"
  });
  const fatal = router.route({
    kind: "runtime_error",
    severity: "FATAL",
    primaryTag: "#RUNTIME",
    language: "en",
    reason: "kill_switch"
  });

  assert.equal(info.decision.telegram, false);
  assert.equal(info.decision.dashboard, true);
  assert.equal(info.decision.mode, "compact");
  assert.equal(warning.decision.telegram, true);
  assert.equal(warning.decision.persistentJournal, false);
  assert.equal(critical.decision.telegram, true);
  assert.equal(critical.decision.persistentJournal, true);
  assert.equal(critical.decision.highlight, true);
  assert.equal(fatal.decision.escalate, true);
  assert.equal(fatal.decision.haltEscalation, true);
});

test("AlertDeduplicator suppresses repeated alerts deterministically", () => {
  const clock = new ManualClock(1_000);
  const dedup = new AlertDeduplicator(clock, { ttlMs: 5_000, maxSuppressionCount: 2 });
  const payload = {
    kind: "websocket_reconnecting" as const,
    severity: "WARNING" as const,
    primaryTag: "#WS" as const,
    symbol: "BTCUSDT",
    reason: "websocket_disconnect"
  };

  const first = dedup.check(payload);
  const second = dedup.check(payload);
  const third = dedup.check(payload);
  const fourth = dedup.check(payload);
  clock.advance(5_001);
  const afterTtl = dedup.check(payload);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.suppressedCount, 1);
  assert.equal(third.accepted, false);
  assert.equal(third.suppressedCount, 2);
  assert.equal(fourth.accepted, true);
  assert.equal(afterTtl.accepted, true);
});

test("AlertAggregator emits summary alerts for repeated alerts", () => {
  const clock = new ManualClock(10_000);
  const aggregator = new AlertAggregator(clock, { windowMs: 300_000, emitThreshold: 3 });
  const payload = {
    kind: "websocket_reconnecting" as const,
    severity: "WARNING" as const,
    primaryTag: "#WS" as const,
    symbol: "BTCUSDT",
    reason: "websocket_disconnect",
    correlation: { traceId: "trace_ws" }
  };

  assert.equal(aggregator.record(payload), undefined);
  assert.equal(aggregator.record(payload), undefined);
  const summary = aggregator.record(payload);

  assert.equal(summary?.kind, "alert_aggregation");
  assert.equal(summary?.count, 3);
  assert.equal(summary?.severity, "WARNING");
  assert.equal(summary?.primaryTag, "#WS");
  assert.equal(summary?.correlation?.traceId, "trace_ws");
  assert.equal(buildTelegramAlert(summary!).includes("3 repeated alerts"), true);
});

test("RuntimeTimeline preserves deterministic alert order and dashboard metadata", () => {
  const timeline = new RuntimeTimeline();
  const first = timeline.appendAlert(100, {
    kind: "runtime_started",
    severity: "INFO",
    primaryTag: "#RUNTIME",
    language: "en"
  });
  const second = timeline.appendAlert(101, {
    kind: "safe_mode",
    severity: "CRITICAL",
    primaryTag: "#RUNTIME",
    secondaryTags: ["#RISK"],
    language: "en",
    reason: "stale_feed",
    seq: 7,
    correlation: { traceId: "trace_safe", eventId: "SAFE_MODE:7" }
  });

  assert.equal(first.timelineSeq, 1);
  assert.equal(second.timelineSeq, 2);
  assert.deepEqual(timeline.readFrom({ timelineSeq: 1 }, 10).map((entry) => entry.timelineSeq), [1, 2]);
  assert.deepEqual(second.tags, ["#RUNTIME", "#RISK"]);
  assert.equal(second.sequence, 7);
  assert.equal(second.dashboard.severityColor, "orange");
  assert.equal(second.dashboard.highlightSuggested, true);
});

test("Dashboard metadata maps severity consistently", () => {
  assert.equal(dashboardMetadataForSeverity("INFO", "compact").severityColor, "blue");
  assert.equal(dashboardMetadataForSeverity("WARNING").severityColor, "yellow");
  assert.equal(dashboardMetadataForSeverity("CRITICAL").severityColor, "orange");
  assert.equal(dashboardMetadataForSeverity("FATAL").severityColor, "red");
  assert.equal(dashboardMetadataForSeverity("FATAL").escalationSuggested, true);
});

test("RuntimeJournal persists structured alert payloads without formatted text", () => {
  const journal = new RuntimeJournal();
  const payload = {
    kind: "safe_mode" as const,
    severity: "CRITICAL" as const,
    primaryTag: "#RUNTIME" as const,
    secondaryTags: ["#RISK" as const],
    language: "en",
    reason: "stale_feed",
    correlation: { traceId: "trace_journal", eventId: "SAFE_MODE:1" }
  };

  const entry = journal.appendStructuredAlert(123, payload);

  assert.equal(entry.type, "structured_alert");
  assert.deepEqual(entry.payload.alert, payload);
  assert.equal(JSON.stringify(entry.payload).includes("SAFE_MODE activated"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.payload.alert)), payload);
});

test("RuntimeJournal persists structured timeline entries without formatted text", () => {
  const timeline = new RuntimeTimeline();
  const journal = new RuntimeJournal();
  const timelineEntry = timeline.appendAlert(1_234, {
    kind: "safe_mode",
    severity: "CRITICAL",
    primaryTag: "#RUNTIME",
    secondaryTags: ["#RISK"],
    language: "en",
    reason: "stale_feed",
    seq: 42,
    state: "SAFE_MODE",
    correlation: { traceId: "trace_timeline", eventId: "SAFE_MODE:42" }
  });

  const journalEntry = journal.appendTimelineEntry(timelineEntry);
  const persisted = journalEntry.payload.timelineEntry as {
    timelineSeq?: number;
    timestamp?: number;
    sequence?: number;
    severity?: string;
    type?: string;
    tags?: string[];
    correlation?: { traceId?: string; eventId?: string };
    summaryKey?: string;
    runtimeState?: string;
    payload?: { kind?: string };
  };

  assert.equal(journalEntry.type, "timeline_entry");
  assert.equal(journalEntry.eventSeq, 42);
  assert.equal(persisted.timelineSeq, timelineEntry.timelineSeq);
  assert.equal(persisted.timestamp, timelineEntry.timestamp);
  assert.equal(persisted.sequence, timelineEntry.sequence);
  assert.equal(persisted.severity, "CRITICAL");
  assert.deepEqual(persisted.tags, ["#RUNTIME", "#RISK"]);
  assert.deepEqual(persisted.correlation, { traceId: "trace_timeline", eventId: "SAFE_MODE:42" });
  assert.equal(persisted.summaryKey, timelineEntry.summaryKey);
  assert.equal(persisted.runtimeState, "SAFE_MODE");
  assert.equal(persisted.payload?.kind, "safe_mode");
  assert.equal(JSON.stringify(journalEntry.payload).includes("SAFE_MODE activated"), false);
});

test("ManualClock supports deterministic time control", async () => {
  const clock = new ManualClock(100);
  assert.equal(clock.now(), 100);
  clock.advance(25);
  assert.equal(clock.now(), 125);
  clock.setTime(1_000);
  await clock.sleep(50);
  assert.equal(clock.now(), 1_050);
});

test("IdempotencyCache is bounded and deterministic with Clock", () => {
  const clock = new ManualClock(0);
  const cache = new IdempotencyCache({ maxSize: 2, ttlMs: 100, clock });

  assert.equal(cache.checkAndAdd("a"), true);
  assert.equal(cache.checkAndAdd("a"), false);
  cache.add("b");
  cache.add("c");
  assert.equal(cache.has("a"), false);
  assert.equal(cache.has("b"), true);
  clock.advance(100);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.size(), 0);
});

test("MetricsRegistry snapshots counters gauges and histograms", () => {
  const metrics = new MetricsRegistry();
  metrics.incrementCounter("events.received");
  metrics.incrementCounter("events.received", 2);
  metrics.setGauge("queue.depth", 7);
  metrics.observeHistogram("latency.ms", 10);
  metrics.observeHistogram("latency.ms", 20);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.counters["events.received"]?.value, 3);
  assert.equal(snapshot.gauges["queue.depth"]?.value, 7);
  assert.equal(snapshot.histograms["latency.ms"]?.count, 2);
  assert.equal(snapshot.histograms["latency.ms"]?.avg, 15);
});

test("HealthMonitor maps runtime pressure to safety actions", () => {
  const monitor = new HealthMonitor({
    queueDepthWarn: 10,
    queueDepthCritical: 20,
    eventRejectRateWarn: 0.1,
    eventRejectRateCritical: 0.5
  });

  const snapshot = monitor.snapshot({
    queueDepth: 25,
    processingLatencyMs: 1,
    websocketState: "CONNECTED",
    replayLag: 0,
    memoryRssBytes: 1_000,
    eventRejectRate: 0,
    persistenceAvailable: true
  }, 123);

  assert.equal(snapshot.status.severity, "CRITICAL");
  assert.equal(snapshot.status.action, "SAFE_MODE");
  assert.equal(monitor.shouldEnter(snapshot, "SAFE_MODE"), true);
});

test("RetryPolicy blocks unsafe order retry and opens circuit breaker", () => {
  const policy = new RetryPolicy({
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 100,
    backoff: "exponential",
    retryBudget: 10,
    circuitBreakerFailureThreshold: 2,
    circuitBreakerResetAfterMs: 1_000
  });

  const unsafe = policy.decide({
    attempt: 0,
    operation: "order_submission",
    retryable: true,
    nowMs: 0
  });
  assert.equal(unsafe.retry, false);
  assert.equal(unsafe.reason, "unsafe_order_retry_without_idempotency_key");

  const persistence = policy.decide({
    attempt: 1,
    operation: "persistence",
    retryable: true,
    nowMs: 0
  });
  assert.equal(persistence.retry, true);
  assert.equal(persistence.delayMs, 20);

  policy.recordFailure(0);
  policy.recordFailure(1);
  assert.equal(policy.circuitState(1), "OPEN");
  assert.equal(policy.circuitState(1_001), "HALF_OPEN");
  policy.recordSuccess();
  assert.equal(policy.circuitState(1_002), "CLOSED");
});

test("RuntimeReplayEngine preserves deterministic ordering and supports step replay", async () => {
  const clock = new ManualClock(1_700_000_000_000);
  const replay = new RuntimeReplayEngine(clock);
  const applied: number[] = [];
  const events = [eventWithSeq(1), eventWithSeq(2), eventWithSeq(3)];

  const first = await replay.replay(events, (event) => {
    applied.push(event.seq);
  }, { mode: "step" });

  assert.equal(first.status, "PAUSED");
  assert.deepEqual(applied, [1]);
  assert.equal(first.cursor.lastSeq, 1);
  assert.equal(first.replayLag, 2);
});

test("RuntimeReplayEngine detects missing duplicate and out-of-order sequences", () => {
  const replay = new RuntimeReplayEngine(new ManualClock(0));

  assert.deepEqual(replay.validate([eventWithSeq(1), eventWithSeq(3)]), [{ seq: 2, reason: "missing_seq" }]);
  assert.deepEqual(replay.validate([eventWithSeq(1), eventWithSeq(1)]), [{ seq: 1, reason: "duplicate_seq" }]);
  assert.deepEqual(replay.validate([eventWithSeq(2), eventWithSeq(1)]), [{ seq: 1, reason: "out_of_order" }]);
});

test("Binance adapter normalizes and idempotently delivers runtime events", async () => {
  const clock = new ManualClock(1_700_000_000_000);
  const received: EventInput[] = [];
  const socket = new BinanceWebsocket(
    { url: "wss://example.invalid", reconnect: true },
    clock,
    new BinanceEventNormalizer("bookTicker", "btcusdt"),
    (event) => {
      received.push(event);
    }
  );

  await socket.connect();
  await socket.onRawMessage({ u: 1, b: "100", B: "2", a: "101", A: "3" });
  await socket.onRawMessage({ u: 1, b: "100", B: "2", a: "101", A: "3" });

  assert.equal(received.length, 1);
  assert.equal(received[0]?.eventType, "BOOK_UPDATE");
  assert.equal(received[0]?.symbol, "BTCUSDT");
  assert.equal(received[0]?.payload.bidPrice, 100);
});

test("RiskGovernor recommends strongest runtime action without mutating state", () => {
  const governor = new RiskGovernor({
    maxExposureUsd: 1_000,
    maxLeverage: 3,
    maxDrawdownUsd: 100,
    rejectRateWarn: 0.1,
    rejectRateCritical: 0.5,
    volatilityWarn: 100,
    volatilityCritical: 300
  });

  const decision = governor.evaluate({
    exposureUsd: 2_000,
    equityUsd: 100,
    drawdownUsd: 10,
    orderRejectRate: 0.2,
    volatilityBps: 350,
    replayConsistent: true,
    persistenceStable: true
  });

  assert.equal(decision.recommendation, "SAFE_MODE");
  assert.equal(decision.events.some((event) => event.reason === "max_exposure_breach"), true);
  assert.equal(decision.events.some((event) => event.reason === "volatility_critical"), true);
});

test("ExecutionKernel enforces passive-only and reduce-only modes", () => {
  const kernel = new ExecutionKernel();

  const passiveRejected = kernel.validate({
    symbol: "BTCUSDT",
    side: "BUY",
    type: "MARKET",
    quantity: 1
  }, { mode: "PASSIVE_ONLY", currentPositionQuantity: 0 });
  assert.equal(passiveRejected.accepted, false);
  assert.equal(passiveRejected.failures[0]?.code, "passive_only_violation");

  const reduceAccepted = kernel.validate({
    symbol: "BTCUSDT",
    side: "SELL",
    type: "MARKET",
    quantity: 1
  }, { mode: "REDUCE_ONLY", currentPositionQuantity: 2 });
  assert.equal(reduceAccepted.accepted, true);
  assert.equal(reduceAccepted.intent?.reduceOnly, true);

  const safeRejected = kernel.validate({
    symbol: "BTCUSDT",
    side: "SELL",
    type: "LIMIT",
    quantity: 1,
    passive: true,
    limitPrice: 101
  }, { mode: "SAFE_MODE", currentPositionQuantity: 2 });
  assert.equal(safeRejected.accepted, false);
  assert.equal(safeRejected.failures[0]?.code, "execution_mode_blocked");
});

test("EventSchemaRegistry validates versioned canonical events", () => {
  const registry = new EventSchemaRegistry();
  const event = eventWithSeq(1);

  assert.equal(registry.validate(event, 1), event);
  assert.equal(registry.validate(RuntimeEventSchema.parse({
    ...eventWithSeq(2, "fee_contract"),
    eventType: "FEE_CHARGED",
    source: "portfolio",
    payload: { amountUsd: "0.125", asset: "USDT" }
  }), 1).eventType, "FEE_CHARGED");
  assert.equal(registry.compatibility("MARKET_TICK", 1, 1).compatible, true);
  assert.equal(registry.compatibility("FUNDING_FEE_APPLIED", 1, 1).compatible, true);
  assert.equal(registry.compatibility("MARKET_TICK", 2, 1).compatible, false);
});

test("RuntimeReplayEngine consumes abstract event sources deterministically", async () => {
  const replay = new RuntimeReplayEngine(new ManualClock(0));
  const source = new MemoryEventSource([eventWithSeq(1), eventWithSeq(2)]);
  const applied: number[] = [];

  const result = await replay.replayFromSource(source, (event) => {
    applied.push(event.seq);
  }, { mode: "realtime", cursor: { seq: 1, offset: 0 }, batchSize: 1 });

  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(applied, [1, 2]);
});

test("PortfolioStateEngine reconstructs deterministic portfolio state", () => {
  const open = RuntimeEventSchema.parse({
    ...eventWithSeq(1),
    eventType: "ORDER_FILLED",
    source: "execution",
    payload: { quantity: 2, price: 100 }
  });
  const close = RuntimeEventSchema.parse({
    ...eventWithSeq(2),
    eventType: "ORDER_FILLED",
    source: "execution",
    payload: { quantity: -1, price: 110 }
  });

  const snapshot = PortfolioStateEngine.reconstruct([open, close]);

  assert.equal(snapshot.positions.BTCUSDT?.quantity, 1);
  assert.equal(snapshot.positions.BTCUSDT?.averagePrice, 100);
  assert.equal(snapshot.realizedPnlUsd, 10);
  assert.equal(snapshot.exposureUsd, 100);
});

test("PortfolioReconstructionEngine calculates realized unrealized fees and funding", () => {
  const open = RuntimeEventSchema.parse({
    ...eventWithSeq(1),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "fill_open",
    payload: { side: "BUY", quantity: 2, price: 100, feeUsd: 0.5, fundingUsd: -0.1 }
  });
  const mark = RuntimeEventSchema.parse({
    ...eventWithSeq(2),
    eventType: "MARKET_TICK",
    payload: { price: 105 }
  });
  const close = RuntimeEventSchema.parse({
    ...eventWithSeq(3),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "fill_close",
    payload: { side: "SELL", quantity: 1, price: 110, feeUsd: 0.25, fundingUsd: 0.05 }
  });

  const result = new PortfolioReconstructionEngine().reconstruct([open, mark, close]);

  assert.equal(result.status, "OK");
  assert.equal(result.snapshot.positions.BTCUSDT?.quantity, 1);
  assert.equal(result.snapshot.positions.BTCUSDT?.averagePrice, 100);
  assert.equal(result.snapshot.realizedPnlUsd, 9.2);
  assert.equal(result.snapshot.feesUsd, 0.75);
  assert.equal(result.snapshot.fundingUsd, -0.05);
  assert.equal(result.snapshot.unrealizedPnlUsd, 10);
});

test("PortfolioStateEngine applies canonical fee funding and realized PnL events with decimal strings", () => {
  const open = RuntimeEventSchema.parse({
    ...eventWithSeq(1),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "fill_decimal_open",
    payload: { side: "BUY", quantity: "1.25", price: "100.10" }
  });
  const fee = RuntimeEventSchema.parse({
    ...eventWithSeq(2, "fee_decimal"),
    eventType: "FEE_CHARGED",
    source: "portfolio",
    payload: { amountUsd: "0.10000001", asset: "USDT", reason: "commission" }
  });
  const funding = RuntimeEventSchema.parse({
    ...eventWithSeq(3, "funding_decimal"),
    eventType: "FUNDING_FEE_APPLIED",
    source: "portfolio",
    payload: { amountUsd: "-0.02500001", asset: "USDT", fundingRate: "-0.0001" }
  });
  const realized = RuntimeEventSchema.parse({
    ...eventWithSeq(4, "realized_decimal"),
    eventType: "REALIZED_PNL_UPDATED",
    source: "portfolio",
    payload: { amountUsd: "1.23456789", asset: "USDT", reason: "settlement" }
  });

  const result = new PortfolioReconstructionEngine().reconstruct([open, fee, funding, realized], {
    feesUsd: 0.10000001,
    fundingUsd: -0.02500001,
    realizedPnlUsd: 1.10956787
  });

  assert.equal(result.status, "OK");
  assert.equal(result.snapshot.feesUsd, 0.10000001);
  assert.equal(result.snapshot.fundingUsd, -0.02500001);
  assert.equal(result.snapshot.realizedPnlUsd, 1.10956787);
  assert.equal(result.snapshot.cashUsd, 1.10956787);
  assert.equal(result.snapshot.positions.BTCUSDT?.feesUsd, 0.10000001);
  assert.equal(result.snapshot.positions.BTCUSDT?.fundingUsd, -0.02500001);
});

test("PortfolioReconstructionEngine handles partial fills multi-symbols and liquidation tracking", () => {
  const events = [
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      symbol: "BTCUSDT",
      eventType: "ORDER_FILLED",
      source: "execution",
      eventId: "btc_1",
      payload: { quantity: 1, price: 100 }
    }),
    RuntimeEventSchema.parse({
      ...eventWithSeq(2),
      symbol: "BTCUSDT",
      eventType: "ORDER_FILLED",
      source: "execution",
      eventId: "btc_2",
      payload: { quantity: 1, price: 120 }
    }),
    RuntimeEventSchema.parse({
      ...eventWithSeq(3),
      symbol: "ETHUSDT",
      eventType: "ORDER_FILLED",
      source: "execution",
      eventId: "eth_1",
      payload: { quantity: -3, price: 50, liquidation: true }
    })
  ];

  const snapshot = new PortfolioReconstructionEngine().reconstruct(events).snapshot;

  assert.equal(snapshot.positions.BTCUSDT?.quantity, 2);
  assert.equal(snapshot.positions.BTCUSDT?.averagePrice, 110);
  assert.equal(snapshot.positions.ETHUSDT?.quantity, -3);
  assert.equal(snapshot.positions.ETHUSDT?.liquidations, 1);
});

test("PortfolioReconstructionEngine detects duplicate and out-of-order fills", () => {
  const duplicateA = RuntimeEventSchema.parse({
    ...eventWithSeq(1),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "dup_fill",
    payload: { quantity: 1, price: 100 }
  });
  const duplicateB = RuntimeEventSchema.parse({
    ...eventWithSeq(2),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "dup_fill",
    payload: { quantity: 1, price: 101 }
  });
  const outOfOrder = RuntimeEventSchema.parse({
    ...eventWithSeq(1),
    eventType: "ORDER_FILLED",
    source: "execution",
    eventId: "late_fill",
    payload: { quantity: 1, price: 99 }
  });

  const duplicateResult = new PortfolioReconstructionEngine().reconstruct([duplicateA, duplicateB]);
  const outOfOrderResult = new PortfolioReconstructionEngine().reconstruct([duplicateB, outOfOrder]);

  assert.equal(duplicateResult.status, "FAILED");
  assert.equal(duplicateResult.divergenceReport.divergences[0]?.type, "duplicate_fill");
  assert.equal(outOfOrderResult.status, "FAILED");
  assert.equal(outOfOrderResult.divergenceReport.divergences[0]?.type, "out_of_order_fill");
});

test("PortfolioReconstructionEngine replay reconstruction is deterministic and reports expected divergence", () => {
  const events = [
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      eventId: "fill_expected",
      payload: { quantity: 1, price: 100 }
    })
  ];
  const engine = new PortfolioReconstructionEngine();
  const first = engine.reconstruct(events, { positions: { BTCUSDT: 2 }, requiredFillIds: ["fill_expected", "missing_fill"] });
  const second = engine.reconstruct(events, { positions: { BTCUSDT: 2 }, requiredFillIds: ["fill_expected", "missing_fill"] });

  assert.deepEqual(first, second);
  assert.equal(first.status, "DIVERGENT");
  assert.equal(first.divergenceReport.divergences.some((divergence) => divergence.type === "missing_fill"), true);
  assert.equal(first.divergenceReport.divergences.some((divergence) => divergence.type === "expected_position_mismatch"), true);
});

test("SnapshotManager creates validates and loads latest snapshot", () => {
  const snapshot = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const store = new MemorySnapshotStore();
  const manager = new SnapshotManager(store);
  const created = manager.createSnapshot({ portfolio: snapshot, runtimeState: "NORMAL" }, { createdAt: 1_000, checkpointSeq: 1 });

  assert.equal(manager.validate(created).valid, true);
  assert.equal(manager.loadLatestSnapshot()?.checkpointSeq, 1);
  assert.equal(store.all().length, 1);
});

test("RecoveryManager returns JOURNAL_REPLAY_RECOVERY for valid snapshot plus deterministic replay", () => {
  const baseSnapshot = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      eventId: "fill_open",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const store = new MemorySnapshotStore();
  const snapshots = new SnapshotManager(store);
  snapshots.createSnapshot({ portfolio: baseSnapshot }, { createdAt: 1_000, checkpointSeq: 1 });
  const source: RecoveryEventSource = {
    readAfter: (seq) => [
      RuntimeEventSchema.parse({
        ...eventWithSeq(seq + 1),
        eventType: "ORDER_FILLED",
        source: "execution",
        eventId: "fill_close",
        payload: { quantity: -1, price: 110 }
      })
    ]
  };

  const recovered = new RecoveryManager(snapshots, source).recover({
    expected: {
      positions: { BTCUSDT: 0 },
      realizedPnlUsd: 10,
      requiredFillIds: ["fill_open", "fill_close"]
    }
  });

  assert.equal(recovered.status, "OK");
  assert.equal(recovered.result, "JOURNAL_REPLAY_RECOVERY");
  assert.equal(recovered.mode, "JOURNAL_REPLAY_RECOVERY");
  assert.equal(recovered.checkpointSeq, 1);
  assert.equal(recovered.replayedEvents, 1);
  assert.equal(recovered.portfolio?.realizedPnlUsd, 10);
});

test("RecoveryManager fails closed on corrupt snapshot", () => {
  const baseSnapshot = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const store = new MemorySnapshotStore();
  const snapshots = new SnapshotManager(store);
  const snapshot = snapshots.createSnapshot({ portfolio: baseSnapshot }, { createdAt: 1_000, checkpointSeq: 1 });
  store.save({ ...snapshot, checksum: "bad" });
  const source: RecoveryEventSource = { readAfter: () => [] };

  const corrupt = new RecoveryManager(snapshots, source).recover();

  assert.equal(corrupt.status, "FAILED_CLOSED");
  assert.equal(corrupt.result, "MANUAL_INTERVENTION_REQUIRED");
  assert.match(corrupt.reason ?? "", /snapshot_invalid/);
});

test("RecoveryManager fails closed on replay divergence after snapshot", () => {
  const snapshot = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(3),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const snapshots = new SnapshotManager();
  snapshots.createSnapshot({ portfolio: snapshot }, { createdAt: 1_000, checkpointSeq: 3 });
  const source: RecoveryEventSource = {
    readAfter: () => [
      RuntimeEventSchema.parse({
        ...eventWithSeq(2),
        eventType: "ORDER_FILLED",
        source: "execution",
        payload: { quantity: 1, price: 100 }
      })
    ]
  };

  const report = new RecoveryManager(snapshots, source).recover();
  assert.equal(report.status, "FAILED_CLOSED");
  assert.equal(report.result, "MANUAL_INTERVENTION_REQUIRED");
  assert.equal(report.replayIntegrityIssues?.[0]?.reason, "checkpoint_replay_overlap");
});

test("RecoveryManager falls back to journal replay when snapshot is missing and journal is safe", () => {
  const snapshots = new SnapshotManager();
  const source: RecoveryEventSource = {
    readAfter: (seq) => [
      RuntimeEventSchema.parse({
        ...eventWithSeq(seq + 1),
        eventType: "ORDER_FILLED",
        source: "execution",
        eventId: "fill_journal_open",
        payload: { quantity: 2, price: 50 }
      }),
      RuntimeEventSchema.parse({
        ...eventWithSeq(seq + 2),
        eventType: "ORDER_FILLED",
        source: "execution",
        eventId: "fill_journal_close",
        payload: { quantity: -1, price: 60 }
      })
    ]
  };

  const report = new RecoveryManager(snapshots, source).recover({
    expected: {
      positions: { BTCUSDT: 1 },
      realizedPnlUsd: 10,
      requiredFillIds: ["fill_journal_open", "fill_journal_close"]
    }
  });

  assert.equal(report.status, "OK");
  assert.equal(report.result, "JOURNAL_REPLAY_RECOVERY");
  assert.equal(report.checkpointSeq, 0);
  assert.equal(report.replayedEvents, 2);
  assert.equal(report.portfolio?.positions.BTCUSDT?.quantity, 1);
  assert.equal(report.portfolio?.realizedPnlUsd, 10);
});

test("RuntimeConsensus matching primary and shadow returns OK and shadow cannot submit orders", () => {
  const portfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const shadow = new ShadowRuntime({ portfolio, governance: "NORMAL", replayStatus: "COMPLETED" });
  const consensus = new RuntimeConsensus();

  const matched = consensus.check({ portfolio, governance: "NORMAL", replayStatus: "COMPLETED" }, shadow.snapshot());

  assert.equal(matched.status, "MATCH");
  assert.equal(matched.recommendation, "OK");
  assert.throws(() => shadow.submitOrder({ symbol: "BTCUSDT", side: "BUY" }), /shadow_runtime_cannot_submit_orders/);
  assert.equal(JSON.parse(JSON.stringify(matched)).status, "MATCH");
});

test("RuntimeConsensus portfolio divergence recommends SAFE_MODE or HALT by severity", () => {
  const portfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const warningPortfolio = {
    ...portfolio,
    fundingUsd: portfolio.fundingUsd + 0.01
  };
  const criticalPortfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 2, price: 100 }
    })
  ]);
  const consensus = new RuntimeConsensus();

  const warning = consensus.check({ portfolio, governance: "NORMAL" }, { portfolio: warningPortfolio, governance: "NORMAL" });
  const critical = consensus.check({ portfolio, governance: "NORMAL" }, { portfolio: criticalPortfolio, governance: "NORMAL" });

  assert.equal(warning.status, "DIVERGENT");
  assert.equal(warning.divergence.issues[0]?.severity, "WARNING");
  assert.equal(warning.recommendation, "SAFE_MODE");
  assert.equal(critical.status, "DIVERGENT");
  assert.equal(critical.divergence.issues[0]?.severity, "CRITICAL");
  assert.equal(critical.recommendation, "HALT");
});

test("RuntimeConsensus governance divergence recommends HALT", () => {
  const portfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const divergent = new RuntimeConsensus().check({ portfolio, governance: "NORMAL" }, { portfolio, governance: "SAFE_MODE" });

  assert.equal(divergent.status, "DIVERGENT");
  assert.equal(divergent.divergence.issues[0]?.area, "governance");
  assert.equal(divergent.divergence.issues[0]?.severity, "CRITICAL");
  assert.equal(divergent.recommendation, "HALT");
});

test("RuntimeConsensus recommendation routes to governance through orchestrator", () => {
  const audit = new MemoryAuditLog();
  const governance = new GovernanceStateMachine();
  const portfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100 }
    })
  ]);
  const warningPortfolio = {
    ...portfolio,
    fundingUsd: portfolio.fundingUsd + 0.01
  };
  const recommendation = new RuntimeConsensus().check({ portfolio, governance: "NORMAL" }, { portfolio: warningPortfolio, governance: "NORMAL" });
  const decision = new RuntimeConsensusGovernanceOrchestrator(governance, audit).apply(recommendation);

  assert.equal(decision.applied, true);
  assert.equal(decision.recommendation, "SAFE_MODE");
  assert.equal(decision.trigger, "stale_feed");
  assert.equal(decision.targetState, "SAFE_MODE");
  assert.equal(governance.state(), "SAFE_MODE");
  assert.equal(audit.entries("runtime_consensus_recommendation_applied").length, 1);
});

test("Dashboard view models are serializable and preserve structured metadata", () => {
  const timeline = new RuntimeTimeline();
  const timelineEntry = timeline.appendAlert(1_000, {
    kind: "safe_mode",
    severity: "CRITICAL",
    primaryTag: "#RUNTIME",
    secondaryTags: ["#RISK"],
    reason: "stale_feed",
    correlation: { traceId: "trace_dashboard" }
  });
  const portfolio = PortfolioStateEngine.reconstruct([
    RuntimeEventSchema.parse({
      ...eventWithSeq(1),
      eventType: "ORDER_FILLED",
      source: "execution",
      payload: { quantity: 1, price: 100, feeUsd: 1 }
    })
  ]);
  const recovery = buildRecoveryStatus({ mode: "CLEAN_RECOVERY", result: "CLEAN_RECOVERY", status: "OK", checkpointSeq: 1, replayedEvents: 0 });
  const replay = buildReplayStatus({ cursor: { nextIndex: 1, lastSeq: 1, watermark: 1_000 }, status: "COMPLETED", replayLag: 0 });
  const consensus = buildConsensusStatus(new RuntimeConsensus().check({ portfolio }, { portfolio }));

  assert.equal(buildTimelineView(timeline.all())[0]?.dashboard.severityColor, "orange");
  assert.equal(buildPnlSummary(portfolio).feesUsd, 1);
  assert.equal(buildPortfolioSummary(portfolio).lastSeq, 1);
  assert.equal(buildRuntimeStateGraph().nodes.some((node) => node.id === "SAFE_MODE"), true);
  assert.equal(recovery.status, "OK");
  assert.equal(replay.status, "COMPLETED");
  assert.equal(consensus.status, "MATCH");
  assert.deepEqual(JSON.parse(JSON.stringify(timelineEntry)).timelineSeq, 1);
});

test("EdgeHealthMonitor detects stale feed duplicate delivery and sequence gaps", () => {
  const clock = new ManualClock(1_000);
  const health = new EdgeHealthMonitor(clock, { staleThresholdMs: 100, reconnectWindowMs: 1_000, reconnectStormThreshold: 3 });

  health.connected("primary");
  clock.advance(101);
  const stale = health.snapshot("primary");
  health.connected("secondary");
  const duplicate = health.duplicateDelivery("secondary");
  const gap = health.sequenceGap("secondary");

  assert.equal(stale.level, "UNTRUSTED");
  assert.equal(stale.recommendation, "SAFE_MODE");
  assert.equal(health.toEvent(stale)?.type, "EDGE_FEED_STALE");
  assert.equal(duplicate.duplicateDeliveries, 1);
  assert.equal(gap.sequenceGaps, 1);
  assert.equal(gap.recommendation, "SAFE_MODE");
});

test("EdgeLatencyTracker detects latency spikes and keeps bounded windows", () => {
  const clock = new ManualClock(1_000);
  const latency = new EdgeLatencyTracker(clock, { windowSize: 3, spikeThresholdMs: 50, staleThresholdMs: 200 });

  latency.observe("feed", 990);
  latency.observe("feed", 980);
  latency.observe("feed", 970);
  const spike = latency.observe("feed", 900);
  const event = latency.toEvent(spike);

  assert.equal(spike.spike, true);
  assert.equal(spike.stale, false);
  assert.equal(spike.recommendation, "THROTTLE");
  assert.equal(latency.sampleCount("feed"), 3);
  assert.equal(event?.type, "EDGE_LATENCY_SPIKE");
});

test("EdgeTrustEvaluator degrades and quarantines low trust feeds deterministically", () => {
  const clock = new ManualClock(10_000);
  const trust = new EdgeTrustEvaluator(clock);
  const trusted = trust.evaluate({
    sourceId: "feed_a",
    lastReceivedAt: 9_990,
    freshnessThresholdMs: 100,
    duplicateDeliveryRate: 0,
    sequenceGapCount: 0,
    reconnectCount: 0,
    latencyDriftMs: 0,
    sourceConsistency: 1,
    replayDivergenceCount: 0
  });
  const quarantined = trust.evaluate({
    sourceId: "feed_b",
    lastReceivedAt: 1_000,
    freshnessThresholdMs: 100,
    duplicateDeliveryRate: 0.5,
    sequenceGapCount: 10,
    reconnectCount: 10,
    latencyDriftMs: 200,
    sourceConsistency: 0,
    replayDivergenceCount: 5
  });

  assert.equal(trusted.level, "TRUSTED");
  assert.equal(trusted.recommendation, "ACCEPT");
  assert.equal(quarantined.level, "QUARANTINED");
  assert.equal(quarantined.recommendation, "QUARANTINE_SOURCE");
});

test("EdgeConsensus returns explicit single-source confidence and detects multi-source divergence", () => {
  const consensus = new EdgeConsensus();
  const first = RuntimeEventSchema.parse({ ...eventWithSeq(1), payload: { price: 100 } });
  const second = RuntimeEventSchema.parse({ ...eventWithSeq(1), payload: { price: 101 } });

  const single = consensus.compare([{ sourceId: "primary", event: first, confidence: 0.9 }]);
  const multi = consensus.compare([
    { sourceId: "primary", event: first, confidence: 0.9 },
    { sourceId: "shadow", event: second, confidence: 0.8 }
  ]);

  assert.equal(single.mode, "SINGLE_SOURCE");
  assert.equal(single.recommendation, "ACCEPT");
  assert.equal(multi.mode, "MULTI_SOURCE");
  assert.equal(multi.divergenceReport.divergent, true);
  assert.equal(multi.recommendation, "SAFE_MODE");
});

test("EdgePartitionDetector detects partial disconnect silent feed and local transport partition", () => {
  const clock = new ManualClock(1_000);
  const detector = new EdgePartitionDetector(clock, 100);

  const partial = detector.detect([
    { sourceId: "a", connected: true, lastSeenAt: 1_000 },
    { sourceId: "b", connected: false, lastSeenAt: 1_000 }
  ]);
  const silent = detector.detect([{ sourceId: "a", connected: true, lastSeenAt: 800 }]);
  const local = detector.detect([{ sourceId: "a", connected: false, lastSeenAt: 800 }]);

  assert.equal(partial.type, "partial_disconnect");
  assert.equal(partial.recommendation, "PASSIVE_ONLY");
  assert.equal(silent.type, "silent_feed");
  assert.equal(silent.recommendation, "SAFE_MODE");
  assert.equal(local.type, "local_transport_partition");
  assert.equal(local.recommendation, "HALT_INPUT");
});

test("EdgeDegradationPolicy maps edge signals to strongest recommendation", () => {
  const clock = new ManualClock(1_000);
  const health = new EdgeHealthMonitor(clock, { staleThresholdMs: 100, reconnectWindowMs: 1_000, reconnectStormThreshold: 3 });
  health.connected("feed");
  clock.advance(101);
  const stale = health.snapshot("feed");
  const trust = new EdgeTrustEvaluator(clock).evaluate({
    sourceId: "feed",
    lastReceivedAt: 1_000,
    freshnessThresholdMs: 100,
    duplicateDeliveryRate: 0,
    sequenceGapCount: 0,
    reconnectCount: 0,
    latencyDriftMs: 0,
    sourceConsistency: 1,
    replayDivergenceCount: 0
  });

  const recommendation = new EdgeDegradationPolicy().evaluate({ health: stale, trust });

  assert.equal(recommendation.recommendation, "SAFE_MODE");
  assert.equal(recommendation.severity, "CRITICAL");
  assert.equal(recommendation.reasons.some((reason) => reason.startsWith("health:")), true);
});

test("EdgeGovernanceOrchestrator applies deterministic governance transitions", () => {
  const audit = new MemoryAuditLog();
  const governance = new GovernanceStateMachine();
  const orchestrator = new EdgeGovernanceOrchestrator({ governance, audit });

  const degraded = orchestrator.apply({
    recommendation: "PASSIVE_ONLY",
    severity: "WARNING",
    reasons: ["health:DEGRADED"]
  }, "feed_a");

  assert.equal(degraded.applied, true);
  assert.equal(degraded.trigger, "reject_rate_spike");
  assert.equal(degraded.targetState, "DEGRADED");
  assert.equal(governance.state(), "DEGRADED");

  const safeMode = orchestrator.apply({
    recommendation: "SAFE_MODE",
    severity: "CRITICAL",
    reasons: ["partition:silent_feed"]
  }, "feed_a");

  assert.equal(safeMode.applied, true);
  assert.equal(safeMode.trigger, "stale_feed");
  assert.equal(safeMode.targetState, "SAFE_MODE");
  assert.equal(governance.state(), "SAFE_MODE");
  assert.equal(audit.entries("edge_recommendation_applied").length, 2);
});

test("EdgeGovernanceOrchestrator ignores ACCEPT and fails closed on invalid transitions", () => {
  const ignoredAudit = new MemoryAuditLog();
  const ignoredGovernance = new GovernanceStateMachine();
  const ignored = new EdgeGovernanceOrchestrator({ governance: ignoredGovernance, audit: ignoredAudit }).apply({
    recommendation: "ACCEPT",
    severity: "INFO",
    reasons: []
  });

  assert.equal(ignored.applied, false);
  assert.equal(ignoredGovernance.state(), "NORMAL");
  assert.equal(ignoredAudit.entries("edge_recommendation_ignored").length, 1);

  const haltedAudit = new MemoryAuditLog();
  const haltedGovernance = new GovernanceStateMachine("HALTED");
  const failed = new EdgeGovernanceOrchestrator({ governance: haltedGovernance, audit: haltedAudit }).apply({
    recommendation: "SAFE_MODE",
    severity: "CRITICAL",
    reasons: ["partition:silent_feed"]
  }, "feed_b");

  assert.equal(failed.applied, false);
  assert.equal(failed.trigger, "stale_feed");
  assert.equal(haltedGovernance.state(), "HALTED");
  assert.equal(haltedAudit.entries("edge_recommendation_failed_closed").length, 1);
});

test("Edge events are structured serializable and preserve quarantine evidence", () => {
  const event = edgeEvent({
    type: "EDGE_SEQUENCE_GAP",
    timestamp: 1_000,
    sourceId: "feed",
    severity: "CRITICAL",
    recommendation: "QUARANTINE_SOURCE",
    quarantined: true,
    correlation: { traceId: "trace_edge", eventId: "edge_evt_1" },
    evidence: [{ sourceId: "feed", expectedSeq: 10, receivedSeq: 12, reason: "sequence_gap" }]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
  assert.equal(event.quarantined, true);
});

test("RuntimeJournal is append-only and validates ordering", () => {
  const journal = new RuntimeJournal();
  journal.appendRuntimeEvent(eventWithSeq(1));
  journal.append("state_transition", 2, { from: "NORMAL", to: "SAFE_MODE" }, { checkpointId: "cp_1" });

  assert.deepEqual(journal.readFrom({ journalSeq: 1 }, 10).map((entry) => entry.journalSeq), [1, 2]);
  assert.deepEqual(journal.validate(), []);
  assert.deepEqual(journal.validate([
    { journalSeq: 1, type: "runtime_event", timestamp: 1, payload: {} },
    { journalSeq: 3, type: "runtime_event", timestamp: 2, payload: {} }
  ]), [{ journalSeq: 2, reason: "missing_journal_seq" }]);
  assert.deepEqual(journal.validate([
    { journalSeq: 1, type: "runtime_event", timestamp: 1, payload: {} },
    { journalSeq: 1, type: "runtime_event", timestamp: 2, payload: {} }
  ]), [
    { journalSeq: 1, reason: "duplicate_journal_seq" },
    { journalSeq: 1, reason: "out_of_order_journal_seq" }
  ]);
  assert.deepEqual(journal.validate([
    { journalSeq: 2, type: "runtime_event", timestamp: 2, payload: {} },
    { journalSeq: 1, type: "runtime_event", timestamp: 1, payload: {} }
  ]), [{ journalSeq: 1, reason: "out_of_order_journal_seq" }]);
});

test("SqliteEventStore batches writes until explicit flush and bounds pending events", () => {
  const sqlitePath = join(mkdtempSync(join(tmpdir(), "sqlite-buffer-")), "runtime.sqlite");
  const writer = new SqliteEventStore(sqlitePath, { maxBufferedEvents: 2 });
  const reader = new SqliteEventStore(sqlitePath);

  writer.append(eventWithSeq(1));
  assert.deepEqual(reader.readFrom(1, 10), []);

  writer.flush();
  assert.deepEqual(reader.readFrom(1, 10).map((event) => event.seq), [1]);

  writer.append(eventWithSeq(2));
  writer.append(eventWithSeq(3));
  assert.throws(() => writer.append(eventWithSeq(4)), /sqlite_event_buffer_full/);

  writer.close();
  reader.close();
});

test("PrecisionMath performs decimal-safe arithmetic and exchange normalization", () => {
  assert.equal(PrecisionMath.add("0.1", "0.2"), "0.3");
  assert.equal(PrecisionMath.multiply("0.010", "1000.10"), "10.001");
  assert.equal(PrecisionMath.divide("1", "3", 4), "0.3333");
  assert.equal(PrecisionMath.compare("10.001", "10.0009"), 1);
  assert.equal(PrecisionMath.safeCompare("10.001", "10.0009"), 1);
  assert.equal(PrecisionMath.isAligned("0.010", "0.001"), true);
  assert.equal(PrecisionMath.isAligned("0.0105", "0.001"), false);
  assert.equal(PrecisionMath.roundToStep("0.0105", "0.001", "floor"), "0.01");
  assert.equal(PrecisionMath.applyStepSize("0.0105", "0.001", "floor"), "0.01");
  assert.equal(PrecisionMath.applyTickSize("1000.15", "0.10", "ceil"), "1000.2");
  assert.equal(PrecisionMath.normalizeQuantity("0.010", "0.001"), "0.01");
  assert.equal(PrecisionMath.normalizePrice("1000.10", "0.10"), "1000.1");
  assert.equal(PrecisionMath.roundToStep("1000.15", "0.10", "ceil"), "1000.2");
  assert.throws(() => PrecisionMath.add("NaN", "1"), /invalid_decimal/);
});

test("StateManager tracks MAE MFE fill drift and execution latency deterministically", () => {
  const manager = new StateManager();
  manager.apply({
    ...eventWithSeq(1, "ev_submit"),
    timestamp: 1_000,
    eventType: "ORDER_SUBMITTED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "ord_alpha", side: "BUY", limitPrice: "100.00" }
  });
  manager.apply({
    ...eventWithSeq(2, "ev_mark_adverse"),
    timestamp: 1_010,
    eventType: "MARKET_TICK",
    symbol: "BTCUSDT",
    payload: { markPrice: "98.50" }
  });
  manager.apply({
    ...eventWithSeq(3, "ev_mark_favorable"),
    timestamp: 1_020,
    eventType: "MARKET_TICK",
    symbol: "BTCUSDT",
    payload: { markPrice: "103.25" }
  });
  manager.apply({
    ...eventWithSeq(4, "ev_ack"),
    timestamp: 1_030,
    exchangeTimestamp: 1_025,
    eventType: "ORDER_ACCEPTED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "ord_alpha" }
  });
  manager.apply({
    ...eventWithSeq(5, "ev_fill"),
    timestamp: 1_050,
    exchangeTimestamp: 1_045,
    eventType: "ORDER_FILLED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "ord_alpha", side: "BUY", quantity: "0.25", price: "100.75" }
  });

  assert.deepEqual(manager.alphaSnapshots()[0], {
    orderClientId: "ord_alpha",
    symbol: "BTCUSDT",
    side: "BUY",
    requestedPrice: "100.00",
    executedPrice: "100.75",
    executedQuantity: "0.25",
    mae: "1.5",
    mfe: "3.25",
    fillDrift: "0.75",
    temporalLatencyMs: 45,
    acknowledgementDelayMs: 25,
    expectedExecutionQuality: "0",
    realizedExecutionQuality: "-0.75",
    evidenceIds: ["ev_submit", "ev_mark_adverse", "ev_mark_favorable", "ev_ack", "ev_fill"]
  });
});

test("StateManager tracks signal intent acknowledgement latency and rejection causes", () => {
  const manager = new StateManager({ maxTrackedOrders: 2, maxEvidenceIdsPerOrder: 3 });
  manager.apply({
    ...eventWithSeq(10, "ev_signal"),
    timestamp: 1_000,
    eventType: "SIGNAL_CREATED",
    symbol: "BTCUSDT",
    payload: { strategyId: "simple_trend_following_v1" }
  });
  manager.apply({
    ...eventWithSeq(11, "ev_intent"),
    timestamp: 1_010,
    eventType: "INTENT_CREATED",
    symbol: "BTCUSDT",
    causationId: "10",
    payload: { side: "BUY", type: "LIMIT", quantity: "1" }
  });
  manager.apply({
    ...eventWithSeq(12, "ev_submit_lineage"),
    timestamp: 1_020,
    eventType: "ORDER_SUBMITTED",
    symbol: "BTCUSDT",
    causationId: "11",
    payload: { orderClientId: "ord_lineage", side: "BUY", limitPrice: "100.00" }
  });
  manager.apply({
    ...eventWithSeq(13, "ev_ack_lineage"),
    timestamp: 1_030,
    exchangeTimestamp: 1_027,
    eventType: "ORDER_ACCEPTED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "ord_lineage" }
  });
  manager.apply({
    ...eventWithSeq(14, "ev_reject_lineage"),
    timestamp: 1_040,
    receiveTimestamp: 1_040,
    eventType: "ORDER_REJECTED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "ord_lineage", reason: "post_only_would_cross" }
  });
  manager.apply({
    ...eventWithSeq(15, "ev_mark_lineage"),
    timestamp: 1_050,
    eventType: "MARKET_TICK",
    symbol: "BTCUSDT",
    payload: { markPrice: "101.00" }
  });

  assert.deepEqual(manager.alphaSnapshots()[0], {
    orderClientId: "ord_lineage",
    symbol: "BTCUSDT",
    side: "BUY",
    requestedPrice: "100.00",
    executedQuantity: "0",
    mae: "0",
    mfe: "1",
    fillDrift: "0",
    temporalLatencyMs: 0,
    acknowledgementDelayMs: 7,
    signalToAckLatencyMs: 27,
    intentToAckLatencyMs: 17,
    rejectionReason: "post_only_would_cross",
    rejectedAt: 1_040,
    expectedExecutionQuality: "0",
    evidenceIds: ["ev_ack_lineage", "ev_reject_lineage", "ev_mark_lineage"]
  });
});

test("StateManager keeps bounded tracked orders deterministically", () => {
  const manager = new StateManager({ maxTrackedOrders: 1 });
  manager.apply({
    ...eventWithSeq(1, "ev_old_submit"),
    timestamp: 1_000,
    eventType: "ORDER_SUBMITTED",
    symbol: "BTCUSDT",
    payload: { orderClientId: "old_order", side: "BUY", limitPrice: "100.00" }
  });
  manager.apply({
    ...eventWithSeq(2, "ev_new_submit"),
    timestamp: 1_001,
    eventType: "ORDER_SUBMITTED",
    symbol: "ETHUSDT",
    payload: { orderClientId: "new_order", side: "SELL", limitPrice: "200.00" }
  });

  assert.deepEqual(manager.alphaSnapshots().map((snapshot) => snapshot.orderClientId), ["new_order"]);
});

test("OperationalMetricsRecorder records runtime truth passively with bounded retention", () => {
  const recorder = new OperationalMetricsRecorder({ maxRecords: 5 });
  recorder.applyRuntimeEvent({
    ...eventWithSeq(1, "ev_reject_metric"),
    timestamp: 1_000,
    eventType: "ORDER_REJECTED",
    symbol: "BTCUSDT",
    payload: { reason: "min_notional" }
  });
  recorder.applyRuntimeEvent({
    ...eventWithSeq(2, "ev_funding_metric"),
    timestamp: 1_010,
    eventType: "ORDER_FILLED",
    symbol: "BTCUSDT",
    payload: { quantity: "1", price: "100", fundingUsd: "-0.125" }
  });
  recorder.record({ timestamp: 1_020, kind: "GOVERNANCE_HALT", reason: "exchange_local_divergence", evidenceIds: ["ev_halt_metric"] });
  recorder.record({ timestamp: 1_030, kind: "WEBSOCKET_RECONNECT", symbol: "BTCUSDT", reason: "market_stream_closed", evidenceIds: ["ev_reconnect_metric"] });
  recorder.record({ timestamp: 1_040, kind: "STALE_FEED", symbol: "BTCUSDT", durationMs: 2500, reason: "market_stream_stale", evidenceIds: ["ev_stale_metric"] });
  recorder.record({ timestamp: 1_050, kind: "SEQUENCE_GAP", symbol: "BTCUSDT", reason: "update_id_gap", evidenceIds: ["ev_gap_metric"] });
  recorder.record({ timestamp: 1_060, kind: "REPLAY_DIVERGENCE", reason: "intent_sequence_mismatch", evidenceIds: ["ev_replay_metric"] });

  const snapshot = recorder.snapshot();
  assert.equal(snapshot.totalRecords, 7);
  assert.equal(snapshot.retainedRecords, 5);
  assert.equal(snapshot.droppedRecords, 2);
  assert.deepEqual(snapshot.orderRejectionsByReason, {});
  assert.deepEqual(snapshot.fundingImpactUsdBySymbol, {});
  assert.deepEqual(snapshot.governanceHaltsByReason, { exchange_local_divergence: 1 });
  assert.equal(snapshot.websocketReconnects, 1);
  assert.equal(snapshot.staleFeedEvents, 1);
  assert.equal(snapshot.staleFeedDurationMs, 2500);
  assert.equal(snapshot.sequenceGaps, 1);
  assert.equal(snapshot.replayDivergences, 1);
  assert.deepEqual(snapshot.records.map((record) => record.seq), [3, 4, 5, 6, 7]);
});

test("OperationalMetricsRecorder accumulates rejection and funding truth deterministically", () => {
  const recorder = new OperationalMetricsRecorder();
  recorder.applyRuntimeEvent({
    ...eventWithSeq(1, "ev_reject_a"),
    timestamp: 1_000,
    eventType: "ORDER_REJECTED",
    symbol: "BTCUSDT",
    payload: { reason: "price_filter" }
  });
  recorder.applyRuntimeEvent({
    ...eventWithSeq(2, "ev_error_a"),
    timestamp: 1_010,
    eventType: "EXECUTION_ERROR",
    symbol: "BTCUSDT",
    payload: { reason: "exchange_timeout" }
  });
  recorder.applyRuntimeEvent({
    ...eventWithSeq(3, "ev_funding_a"),
    timestamp: 1_020,
    eventType: "POSITION_UPDATED",
    symbol: "BTCUSDT",
    payload: { fundingFeeUsd: "0.1" }
  });
  recorder.applyRuntimeEvent({
    ...eventWithSeq(4, "ev_funding_b"),
    timestamp: 1_030,
    eventType: "ORDER_FILLED",
    symbol: "BTCUSDT",
    payload: { quantity: "1", price: "100", fundingUsd: "-0.025" }
  });

  const snapshot = recorder.snapshot();
  assert.deepEqual(snapshot.orderRejectionsByReason, { price_filter: 1, exchange_timeout: 1 });
  assert.deepEqual(snapshot.fundingImpactUsdBySymbol, { BTCUSDT: "0.075" });
  assert.deepEqual(snapshot.records.map((record) => record.evidenceIds[0]), ["ev_reject_a", "ev_error_a", "ev_funding_a", "ev_funding_b"]);
});

test("RequestGovernor applies bounded observable backpressure without hidden retries", () => {
  const governor = new RequestGovernor({ capacity: 2, refillPerSecond: 1, maxQueueDepth: 1 });
  assert.equal(governor.tryAcquire("req_1", 1, 1_000, ["ev_req_1"]).action, "ALLOW");
  assert.equal(governor.tryAcquire("req_2", 1, 1_000, ["ev_req_2"]).action, "ALLOW");
  assert.equal(governor.tryAcquire("req_3", 1, 1_000, ["ev_req_3"]).action, "QUEUE");
  const rejected = governor.tryAcquire("req_4", 1, 1_000, ["ev_req_4"]);
  assert.equal(rejected.action, "REJECT");
  assert.equal(rejected.reason, "request_queue_full");
  assert.deepEqual(governor.drain(2_000).map((request) => request.requestId), ["req_3"]);
  assert.equal(governor.observeRateLimit(2_000, 500, ["ev_429"]).reason, "exchange_rate_limit_observed");
});

test("SurvivabilityProvider halts on replay exchange and exposure integrity failures", () => {
  const provider = new SurvivabilityProvider();
  assert.equal(provider.partialFillAwareExposure({
    currentExposure: "999.995",
    pendingOrderNotional: "5.0005",
    maxExposure: "1000",
    evidenceIds: ["ev_exposure"]
  }).status, "EXPOSURE_LIMIT_BREACHED");

  const decision = provider.evaluate({
    nowMs: 1_700_000_000_000,
    traceId: "trace_survivability",
    exchange: {
      exchangeReachable: true,
      userStreamFresh: true,
      marketStreamFresh: true,
      localExchangeDivergence: true,
      reconnectStorm: false,
      sequenceGap: false,
      evidenceIds: ["ev_exchange"]
    },
    replay: {
      replayConsistent: true,
      mutableHistoryDetected: false,
      missingSequence: false,
      duplicateSequence: false,
      outOfOrderSequence: false,
      evidenceIds: ["ev_replay"]
    },
    exposure: {
      currentExposure: "1",
      pendingOrderNotional: "0",
      maxExposure: "10",
      evidenceIds: ["ev_capital"]
    }
  });
  assert.equal(decision.action, "GOVERNANCE_HALT");
  assert.equal(decision.emergencyStop?.state, "TRIGGERED");
});

test("SurvivabilityProvider degrades stale feeds without halting on isolated latency", () => {
  const provider = new SurvivabilityProvider();
  const isolated = provider.staleFeedGovernance({
    staleDurationMs: 1_500,
    staleThresholdMs: 1_000,
    websocketHealthy: true,
    executionAckDriftMs: 10,
    maxExecutionAckDriftMs: 100,
    sequenceIntegrityOk: true,
    reconciliationConfidence: "HIGH",
    evidenceIds: ["ev_stale_only"]
  });
  assert.equal(isolated.action, "DEGRADE");

  const compound = provider.staleFeedGovernance({
    staleDurationMs: 5_000,
    staleThresholdMs: 1_000,
    websocketHealthy: false,
    executionAckDriftMs: 500,
    maxExecutionAckDriftMs: 100,
    sequenceIntegrityOk: true,
    reconciliationConfidence: "LOW",
    evidenceIds: ["ev_compound_stale"]
  });
  assert.equal(compound.action, "HIBERNATION_MODE");
});

test("StartupTruthReconciler detects ghost orders and treats expected funding as ledger drift", () => {
  const reconciler = new StartupTruthReconciler();
  const basePortfolio = {
    positions: { BTCUSDT: { symbol: "BTCUSDT", quantity: 1, averagePrice: 1000, realizedPnlUsd: 0, unrealizedPnlUsd: 0, feesUsd: 0, fundingUsd: 0, liquidations: 0 } },
    balances: { USDT: { asset: "USDT", available: 99.9, total: 99.9 } },
    cashUsd: 99.9,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    feesUsd: 0,
    fundingUsd: 0,
    exposureUsd: 1000,
    lastSeq: 10,
    appliedFillIds: []
  };
  const funded = reconciler.reconcile({
    local: { portfolio: basePortfolio, openClientOrderIds: ["local_order"], evidenceIds: ["ev_local"] },
    exchange: {
      balances: [{ asset: "USDT", balance: "100.0" }],
      openOrders: [{ symbol: "BTCUSDT", orderId: 1, clientOrderId: "local_order", price: "1000", origQty: "1", executedQty: "0", status: "NEW", type: "LIMIT", side: "BUY" }],
      positions: [{ symbol: "BTCUSDT", positionAmt: "1", entryPrice: "1000", markPrice: "1000", notional: "1000", leverage: "1", unrealizedProfit: "0" }],
      evidenceIds: ["ev_exchange"]
    },
    expectedLedgerDeltas: [{ asset: "USDT", amount: "0.1", category: "funding_fee", evidenceId: "ev_funding" }]
  });
  assert.equal(funded.action, "ALLOW");

  const ghost = reconciler.reconcile({
    local: { portfolio: basePortfolio, openClientOrderIds: [], evidenceIds: ["ev_local"] },
    exchange: {
      balances: [{ asset: "USDT", balance: "100.0" }],
      openOrders: [{ symbol: "BTCUSDT", orderId: 2, clientOrderId: "ghost_order", price: "1000", origQty: "1", executedQty: "0", status: "NEW", type: "LIMIT", side: "BUY" }],
      positions: [{ symbol: "BTCUSDT", positionAmt: "1", entryPrice: "1000", markPrice: "1000", notional: "1000", leverage: "1", unrealizedProfit: "0" }],
      evidenceIds: ["ev_exchange"]
    },
    expectedLedgerDeltas: [{ asset: "USDT", amount: "0.1", category: "funding_fee", evidenceId: "ev_funding" }]
  });
  assert.equal(ghost.action, "GOVERNANCE_HALT");
  assert.equal(ghost.divergences[0]?.kind, "ghost_order");
});

test("RuntimeSessionLock prevents duplicate runtime instances", () => {
  const path = join(mkdtempSync(join(tmpdir(), "runtime-lock-")), "runtime.pid");
  const first = new RuntimeSessionLock(path, { pid: 101, sessionId: "session_a", startedAt: 1_700_000_000_000 });
  const second = new RuntimeSessionLock(path, { pid: 102, sessionId: "session_b", startedAt: 1_700_000_000_001 });
  first.acquire();
  assert.throws(() => second.acquire(), /runtime_session_lock_exists:101:session_a/);
  first.release();
  assert.deepEqual(second.acquire(), { pid: 102, sessionId: "session_b", startedAt: 1_700_000_000_001 });
  second.release();
});

test("WebSocketSequenceIntegrity quarantines sequence violations after bounded resync", () => {
  const integrity = new WebSocketSequenceIntegrity(1);
  assert.equal(integrity.observe("btcusdt@bookTicker", "100", ["ev_seq_100"]).action, "ACCEPT");
  assert.equal(integrity.observe("btcusdt@bookTicker", "101", ["ev_seq_101"]).action, "ACCEPT");
  assert.equal(integrity.observe("btcusdt@bookTicker", "103", ["ev_seq_gap"]).action, "RESYNC_REQUIRED");
  assert.equal(integrity.observe("btcusdt@bookTicker", "105", ["ev_seq_gap_2"]).action, "QUARANTINE");
  assert.equal(integrity.observe("btcusdt@bookTicker", "100", ["ev_old"]).reason, "out_of_order_update_id");
});

test("RestApiGovernor schedules bounded retries and hibernates repeated instability", () => {
  const governor = new RestApiGovernor(new RetryPolicy({
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 500,
    backoff: "exponential",
    circuitBreakerFailureThreshold: 5,
    circuitBreakerResetAfterMs: 1_000
  }), 2);
  const first = governor.observeFailure({ status: 503, nowMs: 1_000, operation: "generic", attempt: 0, retryable: true, evidenceIds: ["ev_503"] });
  assert.equal(first.action, "RETRY_SCHEDULED");
  assert.equal(first.retry?.delayMs, 100);
  const second = governor.observeFailure({ status: 503, nowMs: 1_100, operation: "generic", attempt: 1, retryable: true, evidenceIds: ["ev_503_2"] });
  assert.equal(second.action, "HIBERNATE");
  const fatal = governor.observeFailure({ status: 403, nowMs: 1_200, operation: "generic", attempt: 0, retryable: false, evidenceIds: ["ev_403"] });
  assert.equal(fatal.action, "FATAL_SHUTDOWN");
});

test("ExchangePayloadGuard rejects poison payloads deterministically", () => {
  const guard = new ExchangePayloadGuard({ maxBytes: 32 });
  assert.deepEqual(guard.parseObject("{\"e\":\"ORDER_TRADE_UPDATE\"}"), { e: "ORDER_TRADE_UPDATE" });
  assert.throws(() => guard.parseObject("["), /exchange_payload_malformed_json/);
  assert.throws(() => guard.parseObject("[]"), /exchange_payload_not_object/);
  assert.throws(() => guard.parseObject("{\"payload\":\"too-large-for-this-limit\"}"), /exchange_payload_too_large/);
});

test("GovernanceStateMachine validates transitions and recommendations", () => {
  const governance = new GovernanceStateMachine();

  assert.equal(governance.recommend("reject_rate_spike"), "DEGRADED");
  assert.equal(governance.recommend("rest_api_degradation"), "HIBERNATION_MODE");
  assert.equal(governance.recommend("replay_mismatch"), "GOVERNANCE_HALT");
  assert.equal(governance.recommend("ghost_order"), "GOVERNANCE_HALT");
  assert.equal(governance.transition("DEGRADED", "reject_rate_spike", "reject spike").to, "DEGRADED");
  assert.equal(governance.transition("SAFE_MODE", "stale_feed", "feed stale").from, "DEGRADED");
  assert.throws(() => governance.transition("NORMAL", "manual", "invalid recovery"), /invalid_governance_transition:SAFE_MODE->NORMAL/);
});

test("each runtime profile loads expected limits", async () => {
  const profiles: RuntimeProfile[] = ["DEVELOPMENT", "PAPER", "REPLAY", "SAFE"];

  for (const runtimeProfile of profiles) {
    const config = profileConfig(runtimeProfile);
    const expected = RUNTIME_PROFILE_LIMITS[runtimeProfile];
    assert.equal(config.eventQueueCapacity, expected.eventQueueCapacity);
    assert.equal(config.maxQueueDepth, expected.maxQueueDepth);
    assert.equal(config.maxReplayLag, expected.maxReplayLag);
    assert.equal(config.hotPathWarnMs, expected.hotPathWarnMs);
    assert.equal(config.staleDataHaltMs, expected.staleDataHaltMs);
    assert.equal(config.latencyHaltMs, expected.latencyHaltMs);
    assert.equal(config.maxRejectRate, expected.maxRejectRate);
    assert.equal(config.maxExposureUsd, expected.maxExposureUsd);
    assert.equal(config.maxDrawdownUsd, expected.maxDrawdownUsd);
    assert.equal(config.idempotencyCacheSize, expected.idempotencyCacheSize);

    const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore() });
    await runtime.start();
    assert.equal(runtime.state.mode(), "NORMAL");
    await runtime.stop();
  }
});

test("Binance endpoint config separates REST market streams user streams and WebSocket API", () => {
  const testnet = ConfigSchema.parse({
    runtimeProfile: "LIVE",
    dryRun: false,
    binanceUseTestnet: true,
    liveTradingConfirmation: "I_UNDERSTAND_THIS_TRADES_REAL_MONEY",
    binanceApiKey: "test_key",
    binanceApiSecret: "test_secret"
  });
  assert.equal(testnet.binanceFuturesRestUrl, "https://demo-fapi.binance.com");
  assert.equal(testnet.binanceFuturesUserStreamBaseUrl, "wss://stream.binancefuture.com");
  assert.equal(testnet.binanceFuturesMarketWsBaseUrl, "wss://stream.binancefuture.com");
  assert.equal(testnet.binanceFuturesWsApiUrl, "wss://testnet.binancefuture.com/ws-fapi/v1");
  assert.deepEqual(validateBinanceEndpointMode(testnet), []);

  const production = ConfigSchema.parse({
    runtimeProfile: "LIVE",
    dryRun: false,
    binanceUseTestnet: false,
    liveTradingConfirmation: "I_UNDERSTAND_THIS_TRADES_REAL_MONEY",
    binanceApiKey: "prod_key",
    binanceApiSecret: "prod_secret"
  });
  assert.equal(production.binanceFuturesRestUrl, "https://fapi.binance.com");
  assert.equal(production.binanceFuturesUserStreamBaseUrl, "wss://fstream.binance.com/private");
  assert.equal(production.binanceFuturesMarketWsBaseUrl, "wss://fstream.binance.com");
  assert.equal(production.binanceFuturesWsApiUrl, "wss://ws-fapi.binance.com/ws-fapi/v1");
  assert.deepEqual(validateBinanceEndpointMode(production), []);
});

test("Binance endpoint config fails closed on mixed production and testnet LIVE endpoints", () => {
  assert.throws(() => ConfigSchema.parse({
    runtimeProfile: "LIVE",
    dryRun: false,
    binanceUseTestnet: true,
    binanceFuturesRestUrl: "https://fapi.binance.com",
    binanceFuturesUserStreamBaseUrl: "wss://stream.binancefuture.com",
    binanceFuturesMarketWsBaseUrl: "wss://stream.binancefuture.com",
    binanceFuturesWsApiUrl: "wss://testnet.binancefuture.com/ws-fapi/v1",
    liveTradingConfirmation: "I_UNDERSTAND_THIS_TRADES_REAL_MONEY",
    binanceApiKey: "test_key",
    binanceApiSecret: "test_secret"
  }), /binance_testnet_endpoint_mismatch:binanceFuturesRestUrl/);

  assert.throws(() => ConfigSchema.parse({
    runtimeProfile: "LIVE",
    dryRun: false,
    binanceUseTestnet: false,
    binanceFuturesRestUrl: "https://fapi.binance.com",
    binanceFuturesUserStreamBaseUrl: "wss://stream.binancefuture.com",
    binanceFuturesMarketWsBaseUrl: "wss://fstream.binance.com",
    binanceFuturesWsApiUrl: "wss://ws-fapi.binance.com/ws-fapi/v1",
    liveTradingConfirmation: "I_UNDERSTAND_THIS_TRADES_REAL_MONEY",
    binanceApiKey: "prod_key",
    binanceApiSecret: "prod_secret"
  }), /binance_production_endpoint_mismatch:binanceFuturesUserStreamBaseUrl/);
});

test("Binance market stream routes public and market streams without using WebSocket API", () => {
  const urls: string[] = [];
  const stream = new BinanceMarketStream(
    { binanceFuturesMarketWsBaseUrl: "wss://fstream.binance.com", staleDataHaltMs: 1_000 },
    { nowMs: () => 1_700_000_000_000, monotonicMs: () => 1_700_000_000_000 },
    createLogger(baseConfig),
    async () => undefined,
    () => undefined,
    (url) => {
      urls.push(url);
      const socket = {
        on: () => socket,
        close: () => undefined
      };
      return socket;
    }
  );

  stream.connectBookTicker("BTCUSDT");
  stream.connectMarkPrice("BTCUSDT");
  stream.close();

  assert.equal(urls[0], "wss://fstream.binance.com/public/ws/btcusdt@bookTicker");
  assert.equal(urls[1], "wss://fstream.binance.com/market/ws/btcusdt@markPrice@1s");
  assert.equal(urls.some((url) => url.includes("ws-fapi")), false);
});

test("SAFE profile uses stricter thresholds", () => {
  const development = profileConfig("DEVELOPMENT");
  const safe = profileConfig("SAFE");

  assert.ok(safe.maxQueueDepth < development.maxQueueDepth);
  assert.ok(safe.maxReplayLag < development.maxReplayLag);
  assert.ok(safe.hotPathWarnMs < development.hotPathWarnMs);
  assert.ok(safe.staleDataHaltMs < development.staleDataHaltMs);
  assert.ok(safe.latencyHaltMs < development.latencyHaltMs);
  assert.ok(safe.maxRejectRate < development.maxRejectRate);
  assert.ok(safe.maxExposureUsd < development.maxExposureUsd);
  assert.ok(safe.maxDrawdownUsd < development.maxDrawdownUsd);
  assert.ok(safe.idempotencyCacheSize < development.idempotencyCacheSize);
});

test("audit logs rejected invalid event", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "",
      eventType: "MARKET_TICK",
      correlationId: "corr_audit_reject",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /Too small/
  );

  const rejected = audit.entries("event_rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.eventType, "MARKET_TICK");
  assert.equal(rejected[0]?.correlationId, "corr_audit_reject");
  assert.match(rejected[0]?.reason ?? "", /Too small/);

  await runtime.stop();
});

test("duplicate seq is rejected and audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    seq: 7,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_dup_seq",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      seq: 7,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_dup_seq_2",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_seq:7/
  );

  assert.deepEqual(eventStore.events.map((event) => event.seq), [7]);
  const rejected = audit.entries("event_rejected");
  assert.equal(rejected.at(-1)?.seq, 7);
  assert.equal(rejected.at(-1)?.reason, "duplicate_seq:7");

  await runtime.stop();
});

test("duplicate eventId is rejected", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    eventId: "evt_dup",
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_dup_event_id_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      eventId: "evt_dup",
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_dup_event_id_2",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_event_id:evt_dup/
  );

  assert.equal(eventStore.events.length, 1);
  assert.equal(eventStore.events[0]?.eventId, "evt_dup");

  await runtime.stop();
});

test("runtime accepts valid mode transitions", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  runtime.transitionMode("PAPER");
  assert.equal(runtime.state.mode(), "PAPER");
  runtime.transitionMode("NORMAL");
  assert.equal(runtime.state.mode(), "NORMAL");
  runtime.transitionMode("REPLAY");
  assert.equal(runtime.state.mode(), "REPLAY");
  runtime.transitionMode("NORMAL");
  assert.equal(runtime.state.mode(), "NORMAL");
  runtime.transitionMode("SAFE_MODE");
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  runtime.transitionMode("HALTED");
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("runtime governance halt blocks further ingest and order submission", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });
  await runtime.start();

  runtime.governanceHalt("exchange_local_divergence", ["ev_governance_halt"]);

  assert.equal(runtime.state.mode(), "GOVERNANCE_HALT");
  assert.equal(runtime.state.canSubmitOrders(), false);
  assert.equal(audit.entries("governance_halt_entered").length, 1);
  await assert.rejects(() => runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_after_halt",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  }), /runtime_shutdown/);

  await runtime.stop();
});

test("runtime hibernation suspends execution while keeping health monitoring available", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });
  await runtime.start();
  runtime.hibernate("rest_api_instability_threshold_exceeded", ["ev_hibernate"]);

  assert.equal(runtime.state.mode(), "HIBERNATION_MODE");
  assert.equal(runtime.state.canSubmitOrders(), false);
  assert.equal(runtime.healthSnapshot().mode, "HIBERNATION_MODE");
  assert.equal(audit.entries("hibernation_mode_entered").length, 1);

  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_hibernation_tick",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  assert.equal(audit.entries("event_accepted").length, 1);

  await runtime.stop();
});

test("invalid mode transitions fail closed", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  runtime.transitionMode("SAFE_MODE");
  assert.throws(() => {
    runtime.transitionMode("NORMAL");
  }, /invalid_runtime_transition:SAFE_MODE->NORMAL/);
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("valid intent creates submitted order event", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_2",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_2",
    causationId: "signal_1",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.seq, 3);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(RuntimeEventSchema.parse(published[2]).seq, 3);
  assert.equal(published[2]?.source, "execution");
  assert.equal(published[2]?.payload.status, "SUBMITTED");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(eventStore.events[2]?.payload.status, "SUBMITTED");
  await runtime.stop();
});

test("ExecutionEngine refuses simulated execution in SAFE_MODE and HALTED", () => {
  const portfolio = new PortfolioState();
  const risk = new RiskEngine(baseConfig, portfolio);
  const execution = new ExecutionEngine(risk);
  const intent = RuntimeEventSchema.parse({
    seq: 1,
    timestamp: Date.now(),
    receiveTimestamp: Date.now(),
    processingTimestamp: Date.now(),
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_execution_mode",
    causationId: "signal_execution_mode",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.deepEqual(execution.simulate(intent, "SAFE_MODE", () => 2, Date.now()), { accepted: false, events: [] });
  assert.deepEqual(execution.simulate(intent, "HALTED", () => 2, Date.now()), { accepted: false, events: [] });
});

test("duplicate ORDER_SUBMITTED is not generated for same correlation and causation", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_order_dup",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_order_dup",
    causationId: "signal_dup",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "INTENT_CREATED",
      correlationId: "corr_order_dup",
      causationId: "signal_dup",
      payload: { side: "BUY", type: "MARKET", quantity: 1 }
    }),
    /duplicate_order_submission:corr_order_dup:signal_dup/
  );

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);

  await runtime.stop();
});

test("SELL intent does not trigger SAFE_MODE by itself", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_3",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_3",
    causationId: "signal_2",
    payload: { side: "SELL", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, false);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(published[2]?.payload.side, "SELL");
  await runtime.stop();
});

test("stale market data triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1, sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite") };
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  const staleTimestamp = Date.now() - 10_000;
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_4",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_4",
    causationId: "signal_3",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(published[1]?.payload.reason, "stale_data_halt");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(eventStore.events[1]?.payload.reason, "stale_data_halt");
  await runtime.stop();
});

test("runtime ingests market data through generic adapter without Binance payload leakage", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();

  await runtime.connectMarketDataAdapter({
    id: "generic-market-adapter",
    async start(sink, lifecycleSink) {
      await sink({
        eventId: "generic:book:10",
        receiveTimestamp: 1_700_000_000_100,
        exchangeTimestamp: 1_700_000_000_000,
        source: "market_data_adapter",
        symbol: "BTCUSDT",
        eventType: "BOOK_UPDATE",
        correlationId: "corr_generic_book",
        causationId: "generic-market-adapter",
        payload: {
          marketDataKind: "order_book",
          updateId: 10,
          sequence_id: 10,
          bidPrice: 100.1,
          bidQuantity: 2.5,
          askPrice: 100.2,
          askQuantity: 3.5
        }
      });
      await sink({
        eventId: "generic:trade:11",
        receiveTimestamp: 1_700_000_000_110,
        exchangeTimestamp: 1_700_000_000_010,
        source: "market_data_adapter",
        symbol: "BTCUSDT",
        eventType: "MARKET_TICK",
        correlationId: "corr_generic_trade",
        causationId: "generic-market-adapter",
        payload: {
          marketDataKind: "trade",
          tradeId: 11,
          sequence_id: 11,
          price: 100.15,
          quantity: 0.25,
          volume: 0.25
        }
      });
      await lifecycleSink({
        adapterId: "generic-market-adapter",
        action: "connected",
        symbol: "BTCUSDT",
        stream: "trade"
      });
    },
    stop() {
      return undefined;
    }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["BOOK_UPDATE", "MARKET_TICK"]);
  assert.equal(eventStore.events[0]?.source, "market_data_adapter");
  assert.equal(eventStore.events[0]?.payload.stream, undefined);
  assert.equal(eventStore.events[0]?.payload.marketDataKind, "order_book");
  assert.equal(eventStore.events[1]?.payload.stream, undefined);
  assert.equal(eventStore.events[1]?.payload.marketDataKind, "trade");
  assert.equal(eventStore.events[1]?.payload.quantity, 0.25);
  assert.equal(eventStore.events[1]?.payload.volume, 0.25);
  assert.equal(JSON.stringify(eventStore.events).includes("bookTicker"), false);
  assert.equal(RuntimeEventSchema.parse(eventStore.events[0]).payload.bidPrice, 100.1);

  await runtime.stop();
});

test("Binance market adapter normalizes exchange payloads before runtime boundary", () => {
  const event = normalizeBinanceMarketPayloadForAdapter("markPrice", "btcusdt", {
    s: "BTCUSDT",
    p: "100.12",
    i: "100.10",
    P: "100.11",
    r: "0.0001",
    T: 1_700_000_001_000,
    E: 1_700_000_000_120
  }, 1_700_000_000_120);

  assert.equal(event.source, "market_data_adapter");
  assert.equal(event.payload.stream, undefined);
  assert.equal(event.payload.marketDataKind, "mark_price");
  assert.equal(event.payload.markPrice, 100.12);
});

test("market adapter rejects Binance-specific payloads at runtime boundary", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await assert.rejects(
    runtime.ingestExternalMarketEvent({
      source: "market_data_adapter",
      symbol: "BTCUSDT",
      eventType: "BOOK_UPDATE",
      correlationId: "corr_bad_market_payload",
      causationId: "generic-market-adapter",
      payload: {
        stream: "bookTicker",
        sequence_id: 10,
        bidPrice: 100.1,
        bidQuantity: 2.5,
        askPrice: 100.2,
        askQuantity: 3.5
      }
    }),
    /external_market_event_payload_not_adapter_neutral/
  );

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(eventStore.events.length, 0);
  assert.equal(audit.entries("safe_mode_entered").length, 0);

  await runtime.stop();
});

test("stale websocket stream lifecycle triggers SAFE_MODE", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "stale_stream_detected",
    symbol: "ETHUSDT",
    stream: "trade",
    reason: "stale_market_stream"
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(eventStore.events[0]?.eventType, "SAFE_MODE");
  assert.equal(eventStore.events[0]?.payload.reason, "stale_market_stream");
  assert.equal(audit.entries("market_stream_stale_stream_detected").length, 1);

  await runtime.stop();
});

test("websocket disconnect enters SAFE_MODE and reconnect recovery is audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "order_book",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "order_book",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "connected",
    symbol: "BTCUSDT",
    stream: "order_book"
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(eventStore.events[0]?.payload.reason, "websocket_disconnect");
  assert.equal(audit.entries("market_stream_disconnected").length, 1);
  assert.equal(audit.entries("market_stream_reconnecting").length, 1);
  assert.equal(audit.entries("market_stream_connected").length, 1);

  await runtime.stop();
});

test("ORDER_FILLED updates PortfolioState", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_fill_portfolio",
    causationId: "order_1",
    payload: { quantity: 2, price: 100, unrealizedPnl: 5 }
  });

  assert.deepEqual(runtime.portfolio.snapshot().positions["BTCUSDT"], {
    symbol: "BTCUSDT",
    quantity: 2,
    averagePrice: 100,
    unrealizedPnl: 5
  });
  assert.equal(runtime.state.mode(), "NORMAL");

  await runtime.stop();
});

test("POSITION_UPDATED updates PortfolioState", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_portfolio",
    causationId: "account_update",
    payload: { quantity: -3, price: 200, unrealizedPnl: -7 }
  });

  assert.deepEqual(runtime.portfolio.snapshot().positions["ETHUSDT"], {
    symbol: "ETHUSDT",
    quantity: -3,
    averagePrice: 200,
    unrealizedPnl: -7
  });
  assert.equal(runtime.state.mode(), "NORMAL");

  await runtime.stop();
});

test("matching position reconciliation does not trigger SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_position_match",
    causationId: "order_2",
    payload: { quantity: 4, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_match",
    causationId: "account_update",
    payload: { quantity: 4, price: 100 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, false);

  await runtime.stop();
});

test("mismatched position triggers SAFE_MODE and audit", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_position_mismatch",
    causationId: "order_3",
    payload: { quantity: 5, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_mismatch",
    causationId: "account_update",
    payload: { quantity: 3, price: 100 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  const mismatches = audit.entries("position_mismatch");
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.symbol, "BTCUSDT");
  assert.equal(mismatches[0]?.expectedPosition, 5);
  assert.equal(mismatches[0]?.actualPosition, 3);
  assert.equal(mismatches[0]?.reason, "position_mismatch");

  await runtime.stop();
});

test("orphan Binance live fill is appended then fails closed", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingestBinanceLiveExecutionEvent({
    source: "binance_user_ws",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "orphan_client_order",
    causationId: "orphan_client_order",
    payload: { orderClientId: "orphan_client_order", orderId: "123", quantity: 1, price: 100, status: "FILLED" }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["ORDER_FILLED", "SAFE_MODE"]);
  assert.equal(eventStore.events[0]?.source, "binance_user_ws");
  assert.equal(eventStore.events[1]?.payload.reason, "orphan_fill");
  assert.equal(audit.entries("orphan_fill_detected").length, 1);
  assert.equal(runtime.healthSnapshot().orphanFillsDetected, 1);
  assert.deepEqual(new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore }).replayPersisted(), []);

  await runtime.stop();
});

test("Binance live execution reconnect recovery accepts known fills deterministically", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const rest = new MockBinanceRest();
  let runtime!: TradingRuntime;
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => runtime.ingestBinanceLiveExecutionEvent(event), (event) => runtime.handleLiveExecutionLifecycle(event), {
    config: liveTestConfig,
    rest,
    nowMs: () => 1_700_000_000_000
  });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);
  runtime = new TradingRuntime({
    config: liveTestConfig,
    logger: createLogger(liveTestConfig),
    eventStore,
    audit,
    liveExecution
  });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_SUBMITTED",
    correlationId: "corr_live_reconnect",
    causationId: "intent_live_reconnect",
    payload: {
      orderClientId: "live_client_order_1",
      idempotencyKey: "corr_live_reconnect:1",
      side: "BUY",
      type: "LIMIT",
      quantity: "0.010",
      limitPrice: "1000.10",
      dailyLossUsd: 0,
      status: "SUBMITTED",
      liveExecution: true
    }
  });
  await runtime.handleLiveExecutionLifecycle({
    action: "reconnecting",
    symbol: "BTCUSDT",
    reason: "websocket_partition"
  });
  await runtime.handleLiveExecutionLifecycle({
    action: "recovered",
    symbol: "BTCUSDT",
    reason: "websocket_recovered"
  });
  await runtime.ingestBinanceLiveExecutionEvent({
    source: "binance_user_ws",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "live_client_order_1",
    causationId: "live_client_order_1",
    payload: { orderClientId: "live_client_order_1", orderId: "456", quantity: 1, price: 101, status: "FILLED" }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["ORDER_SUBMITTED", "ORDER_ACCEPTED", "ORDER_FILLED"]);
  assert.equal(audit.entries("live_order_submission_attested").length, 1);
  assert.equal(audit.entries("live_execution_reconnecting").length, 1);
  assert.equal(audit.entries("live_execution_reconciliation_recommended").length, 1);
  assert.equal(runtime.healthSnapshot().liveExecutionReconnectCount, 1);
  assert.equal(runtime.healthSnapshot().liveExecutionDegraded, false);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("live execution mode submits generated orders to Binance adapter", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const rest = new MockBinanceRest();
  const liveExecution = new RecordingLiveExecution({ config: { ...liveTestConfig, allowMarketOrders: true }, rest });
  const runtime = new TradingRuntime({ config: { ...liveTestConfig, allowMarketOrders: true }, logger: createLogger(liveTestConfig), eventStore, audit, liveExecution });

  await refreshLiveExecutionSnapshot(liveExecution);
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_live_intent",
    causationId: "market_live_intent",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_live_intent",
    causationId: "signal_live_intent",
    payload: {
      side: "BUY",
      type: "MARKET",
      quantity: 1,
      markPrice: 10,
      dailyLossUsd: 0,
      topOfBookQuantity: 10,
      executionMode: "LIVE"
    }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(liveExecution.submittedOrders.length, 1);
  assert.equal(liveExecution.submittedOrders[0]?.payload.executionMode, "LIVE");
  assert.equal(audit.entries("live_order_submission_attested").length, 1);
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);

  await runtime.stop();
});

test("live execution restores known order ids before accepting post-restart fills", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_SUBMITTED",
    correlationId: "corr_live_restart",
    causationId: "intent_live_restart",
    payload: {
      orderClientId: "live_restart_order_1",
      idempotencyKey: "corr_live_restart:1",
      side: "BUY",
      type: "MARKET",
      quantity: 1,
      status: "SUBMITTED",
      executionMode: "PAPER"
    }
  });
  await runtime.stop();

  const restartedRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await restartedRuntime.start();
  await restartedRuntime.ingestBinanceLiveExecutionEvent({
    source: "binance_user_ws",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "live_restart_order_1",
    causationId: "live_restart_order_1",
    payload: { orderClientId: "live_restart_order_1", orderId: "789", quantity: 1, price: 102, status: "FILLED" }
  });

  assert.equal(restartedRuntime.state.mode(), "NORMAL");
  assert.equal(audit.entries("orphan_fill_detected").length, 0);
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["ORDER_SUBMITTED", "ORDER_FILLED"]);

  await restartedRuntime.stop();
});

test("runtime stop closes live execution adapter", async () => {
  const liveExecution = new RecordingLiveExecution();
  const runtime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    liveExecution
  });

  await runtime.start();
  await runtime.stop();
  assert.equal(liveExecution.closeCount, 1);
});

test("Binance REST buildSignedQuery matches Binance HMAC example", () => {
  const rest = new BinanceRest({
    baseUrl: "https://demo-fapi.binance.com",
    apiKey: "key",
    apiSecret: "  2b5eb11e18796d12d88f13dc27dbbd02c2cc51ff7059765ed9821957d82bb4d9  "
  });
  const signed = rest.buildSignedQuery({
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT",
    quantity: 1,
    price: 9000,
    timeInForce: "GTC",
    recvWindow: 5000,
    timestamp: 1591702613943
  });

  assert.equal(
    signed.queryWithoutSignature,
    "symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=1&price=9000&timeInForce=GTC&recvWindow=5000&timestamp=1591702613943"
  );
  assert.equal(signed.signature, "3c661234138461fcc7a7d8746c6558c9842d4e10870d2ecbedf7777cad694af9");
  assert.equal(signed.signedQuery, `${signed.queryWithoutSignature}&signature=${signed.signature}`);
});

test("Binance REST forms signed GET balance request without exposing secret", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  let capturedApiKey = "";
  const secret = "test_secret";
  const previousDebug = process.env.BINANCE_SIGNING_DEBUG;
  const originalNow = Date.now;
  const originalConsoleError = console.error;
  const debugLines: string[] = [];
  const fetchImpl: BinanceFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = init?.body;
    capturedApiKey = new Headers(init?.headers).get("X-MBX-APIKEY") ?? "";
    return new Response(JSON.stringify([
      { asset: "USDT", balance: "100.00" }
    ]), { status: 200, headers: { "x-mbx-used-weight-1m": "3", "x-mbx-order-count-10s": "1" } });
  };
  const rest = new BinanceRest({ baseUrl: "https://demo-fapi.binance.com", apiKey: " key ", apiSecret: ` ${secret} `, recvWindow: 5000, fetchImpl });

  process.env.BINANCE_SIGNING_DEBUG = "true";
  Date.now = () => 1591702613943;
  console.error = (...args: unknown[]) => {
    debugLines.push(args.map(String).join(" "));
  };

  try {
    await rest.accountBalance();
  } finally {
    Date.now = originalNow;
    console.error = originalConsoleError;
    if (previousDebug === undefined) {
      delete process.env.BINANCE_SIGNING_DEBUG;
    } else {
      process.env.BINANCE_SIGNING_DEBUG = previousDebug;
    }
  }

  const parsedUrl = new URL(capturedUrl);
  const queryParts = parsedUrl.search.slice(1).split("&");
  const queryWithoutSignature = queryParts.slice(0, -1).join("&");
  const signature = queryParts.at(-1) ?? "";

  assert.equal(parsedUrl.origin + parsedUrl.pathname, "https://demo-fapi.binance.com/fapi/v2/balance");
  assert.equal(capturedApiKey, "key");
  assert.equal(capturedBody, undefined);
  assert.equal(parsedUrl.searchParams.get("timestamp"), "1591702613943");
  assert.equal(parsedUrl.searchParams.get("recvWindow"), "5000");
  assert.match(signature, /^signature=[0-9a-f]{64}$/);
  assert.equal(queryWithoutSignature.includes("signature="), false);
  assert.equal(signature, `signature=${rest.signQuery(queryWithoutSignature)}`);
  assert.equal(capturedUrl.includes(secret), false);
  assert.equal(debugLines.some((line) => line.includes("/fapi/v2/balance")), true);
  assert.equal(debugLines.join("\n").includes(secret), false);
  assert.equal(debugLines.join("\n").includes(signature.slice("signature=".length)), false);
  assert.equal(rest.rateLimitSnapshot().orderCount10s, 1);
});

test("Binance REST uses observed server time offset for signed timestamps", async () => {
  const originalNow = Date.now;
  const urls: string[] = [];
  const fetchImpl: BinanceFetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/fapi/v1/time")) {
      return new Response(JSON.stringify({ serverTime: 1_000 }), { status: 200 });
    }
    return new Response(JSON.stringify([{ asset: "USDT", balance: "100.00" }]), { status: 200 });
  };
  const rest = new BinanceRest({ baseUrl: "https://demo-fapi.binance.com", apiKey: "key", apiSecret: "test_secret", fetchImpl });

  Date.now = () => 2_000;
  try {
    await rest.serverTime();
    await rest.accountBalance();
  } finally {
    Date.now = originalNow;
  }

  const signedUrl = new URL(urls[1] ?? "");
  assert.equal(signedUrl.searchParams.get("timestamp"), "1000");
});

test("Binance REST maps invalid signature errors to safe diagnostic", async () => {
  const secret = "test_secret";
  const fetchImpl: BinanceFetch = async () => new Response(JSON.stringify({
    code: -1022,
    msg: "Signature for this request is not valid."
  }), { status: 400 });
  const rest = new BinanceRest({ baseUrl: "https://demo-fapi.binance.com", apiKey: "key", apiSecret: secret, fetchImpl });

  await assert.rejects(
    () => rest.accountBalance(),
    (error: unknown) => {
      assert.equal(error instanceof BinanceRestError, true);
      const restError = error as BinanceRestError;
      assert.equal(restError.message.includes("BINANCE_SIGNATURE_INVALID"), true);
      assert.equal(restError.msg, "BINANCE_SIGNATURE_INVALID");
      assert.equal(restError.message.includes(secret), false);
      assert.equal(restError.msg.includes(secret), false);
      return true;
    }
  );
});

test("live safety gates reject missing confirmation dry run and kill switch before REST order", async () => {
  for (const [reason, config] of [
    ["live_trading_confirmation_missing", { ...liveTestConfig, liveTradingConfirmation: "" }],
    ["dry_run_enabled", { ...liveTestConfig, dryRun: true }],
    ["kill_switch_enabled", { ...liveTestConfig, killSwitch: true }]
  ] as const) {
    const rest = new MockBinanceRest();
    const emitted: EventInput[] = [];
    const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config, rest });

    await liveExecution.submitOrder(liveOrderSubmitted());

    assert.equal(rest.newOrders.length, 0);
    assert.equal(emitted[0]?.eventType, "ORDER_REJECTED");
    assert.equal(emitted[0]?.payload.reason, reason);
  }

});

test("daily loss state available and under limit allows live order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", -1, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 1);
  assert.equal(emitted[0]?.eventType, "ORDER_ACCEPTED");
});

test("daily loss state updates from execution reports before gating orders", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.onExecutionReport({
    symbol: "BTCUSDT",
    executionType: "TRADE",
    orderId: "order_1",
    clientOrderId: "client_1",
    side: "SELL",
    quantity: 0.001,
    price: 1000,
    realizedPnl: -2,
    eventTime: 1_700_000_000_000,
    transactionTime: 1_700_000_000_000
  });
  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 1);
  assert.equal(liveExecution.currentDailyLossUsd("BTCUSDT", 1_700_000_000_001), 2);
});

test("daily loss state over limit rejects live order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", -(liveTestConfig.maxDailyLossUsd + 1), 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "daily_loss_limit");
});

test("daily loss state unavailable in LIVE rejects before REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.eventType, "ORDER_REJECTED");
  assert.equal(emitted[0]?.payload.reason, "DAILY_LOSS_STATE_UNAVAILABLE");
});

test("LIVE orders require production endpoint and mainnet mode before REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, {
    config: {
      ...liveTestConfig,
      binanceUseTestnet: true,
      binanceFuturesRestUrl: "https://demo-fapi.binance.com"
    },
    rest,
    nowMs: () => 1_700_000_000_000
  });

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "binance_testnet_enabled_for_live_order");
});

test("live survivability snapshot is required and keeps exchange reads out of submit path", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);

  await liveExecution.submitOrder(liveOrderSubmitted());
  assert.equal(rest.newOrders.length, 0);
  assert.equal(rest.exchangeInfoCalls, 0);
  assert.equal(rest.positionRiskCalls, 0);
  assert.equal(emitted[0]?.payload.reason, "exchange_snapshot_missing");

  emitted.length = 0;
  await refreshLiveExecutionSnapshot(liveExecution);
  assert.equal(rest.exchangeInfoCalls, 1);
  assert.equal(rest.positionRiskCalls, 1);

  await liveExecution.submitOrder(liveOrderSubmitted());
  assert.equal(rest.newOrders.length, 1);
  assert.equal(rest.exchangeInfoCalls, 1);
  assert.equal(rest.positionRiskCalls, 1);
  assert.equal(emitted[0]?.eventType, "ORDER_ACCEPTED");
});

test("live survivability snapshot fails closed when stale or degraded", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  let now = 1_700_000_000_000;
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => now, snapshotTtlMs: 10 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, now);
  await refreshLiveExecutionSnapshot(liveExecution);
  now += 11;

  await liveExecution.submitOrder(liveOrderSubmitted());
  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "survivability_snapshot_stale");

  const degradedRest = new MockBinanceRest();
  degradedRest.exchangeInfoError = new Error("exchange_info_down");
  const degradedEvents: EventInput[] = [];
  const degradedExecution = new LiveExecution.BinanceLiveExecution((event) => { degradedEvents.push(event); }, () => undefined, { config: liveTestConfig, rest: degradedRest, nowMs: () => 1_700_000_000_000 });
  degradedExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  const snapshot = await degradedExecution.refreshSurvivabilitySnapshot(["BTCUSDT"], ["ev_degraded_snapshot"]);
  assert.equal(snapshot.status, "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_DEGRADED");

  await degradedExecution.submitOrder(liveOrderSubmitted());
  assert.equal(degradedRest.newOrders.length, 0);
  assert.equal(degradedEvents[0]?.payload.reason, "survivability_snapshot_degraded");
});

test("live survivability exposure uses decimal-safe snapshot arithmetic", async () => {
  const rest = new MockBinanceRest();
  rest.positionRiskResponse = [{ symbol: "BTCUSDT", positionAmt: "0", entryPrice: "1000", markPrice: "1000", notional: "999.995", leverage: "1", unrealizedProfit: "0" }];
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: { ...liveTestConfig, maxExposureUsd: 1_000 }, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted({
    payload: { ...liveOrderSubmitted().payload, quantity: "0.005", limitPrice: "1000.10" }
  }));

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "max_exposure_limit");
});

test("live order rejection audit contains structured safety context", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: { ...liveTestConfig, killSwitch: true }, rest, nowMs: () => 1_700_000_000_000 });

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.deepEqual(emitted[0]?.payload, {
    orderClientId: "corr_live_order:1",
    reason: "kill_switch_enabled",
    status: "REJECTED",
    side: "BUY",
    quantity: "0.010",
    price: "1000.10",
    intendedNotional: "10.001",
    runtimeProfile: "LIVE",
    killSwitch: true,
    clientOrderId: "corr_live_order:1",
    timestamp: 1_700_000_000_000
  });
});

test("daily loss state unavailable in PAPER stays local and makes no REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: { ...liveTestConfig, runtimeProfile: "PAPER", dryRun: true }, rest });

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.eventType, "ORDER_REJECTED");
  assert.equal(emitted[0]?.payload.reason, "runtime_profile_not_live");
});

test("live safety gates block market orders unless explicitly allowed", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted({
    payload: { ...liveOrderSubmitted().payload, type: "MARKET", markPrice: "1000.10" }
  }));

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.eventType, "ORDER_REJECTED");
  assert.equal(emitted[0]?.payload.reason, "market_orders_disabled");
});

test("live safety gates reject orders over max notional before REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: { ...liveTestConfig, maxOrderNotionalUsd: 10 }, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "order_notional_limit");
});

test("live safety gates reject unknown exposure state before REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "exchange_snapshot_missing");
});

test("live safety gates reject duplicate clientOrderId including pending timeout retry", async () => {
  const rest = new MockBinanceRest();
  rest.newOrderError = new Error("network_timeout_after_submit");
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await assert.rejects(() => liveExecution.submitOrder(liveOrderSubmitted()), /network_timeout_after_submit/);
  rest.newOrderError = undefined;
  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 1);
  assert.equal(emitted.at(-1)?.payload.reason, "duplicate_client_order_id");
});

test("live safety gates reject stale or unsafe websocket/feed state", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.onLifecycle({ action: "reconnecting", symbol: "BTCUSDT", reason: "websocket_reconnecting" });
  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 0);
  assert.equal(emitted[0]?.payload.reason, "market_feed_unsafe");
});

test("one-position rule rejects new entries but permits explicit reduceOnly exits", async () => {
  const rest = new MockBinanceRest();
  rest.positionRiskResponse = [{ symbol: "BTCUSDT", positionAmt: "0.010", entryPrice: "1000", markPrice: "1000", notional: "10", leverage: "1", unrealizedProfit: "0" }];
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());
  await liveExecution.submitOrder(liveOrderSubmitted({
    correlationId: "corr_reduce_only_exit",
    payload: {
      ...liveOrderSubmitted().payload,
      idempotencyKey: "corr_reduce_only_exit:1",
      side: "SELL",
      reduceOnly: true
    }
  }));

  assert.equal(rest.newOrders.length, 1);
  assert.equal(emitted[0]?.payload.reason, "one_position_rule_active");
  assert.equal(rest.newOrders[0]?.reduceOnly, true);
});

test("live order validation maps idempotency key and exchange filters before REST order", async () => {
  const rest = new MockBinanceRest();
  const emitted: EventInput[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution((event) => { emitted.push(event); }, () => undefined, { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 });
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await liveExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rest.newOrders.length, 1);
  assert.equal(rest.newOrders[0]?.newClientOrderId, "corr_live_order:1");
  assert.equal(rest.newOrders[0]?.quantity, "0.01");
  assert.equal(rest.newOrders[0]?.price, "1000.1");
  assert.equal(emitted[0]?.eventType, "ORDER_ACCEPTED");
  assert.equal(emitted[0]?.payload.notional, "10.001");
  assert.equal(emitted[0]?.payload.reduceOnly, false);
  assert.equal(emitted[0]?.payload.runtimeProfile, "LIVE");
  assert.deepEqual(emitted[0]?.payload.safetyGatesPassed, [
    "live_profile",
    "dry_run_disabled",
    "kill_switch_clear",
    "production_endpoint",
    "idempotency_reserved",
    "snapshot_fresh",
    "daily_loss_known",
    "order_notional_cap",
    "exposure_cap",
    "one_position_rule"
  ]);

  const invalidRest = new MockBinanceRest();
  const rejected: EventInput[] = [];
  const invalidExecution = new LiveExecution.BinanceLiveExecution((event) => { rejected.push(event); }, () => undefined, { config: liveTestConfig, rest: invalidRest, nowMs: () => 1_700_000_000_000 });
  invalidExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(invalidExecution);
  await invalidExecution.submitOrder(liveOrderSubmitted({
    payload: { ...liveOrderSubmitted().payload, quantity: "0.0105" }
  }));
  assert.equal(invalidRest.newOrders.length, 0);
  assert.equal(rejected[0]?.payload.reason, "quantity_step_invalid");
});

test("Binance REST errors map to ORDER_REJECTED and unexpected errors map to EXECUTION_ERROR", async () => {
  const restRejected = new MockBinanceRest();
  restRejected.newOrderError = new BinanceRestError("binance_rest_error:400:-2019", 400, -2019, "Margin is insufficient.", "/fapi/v1/order");
  const rejected: EventInput[] = [];
  const rejectExecution = new LiveExecution.BinanceLiveExecution((event) => { rejected.push(event); }, () => undefined, { config: liveTestConfig, rest: restRejected, nowMs: () => 1_700_000_000_000 });
  rejectExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(rejectExecution);

  await rejectExecution.submitOrder(liveOrderSubmitted());

  assert.equal(rejected[0]?.eventType, "ORDER_REJECTED");
  assert.equal(rejected[0]?.payload.code, -2019);
  assert.equal(rejected[0]?.payload.reason, "Margin is insufficient.");

  const restErrored = new MockBinanceRest();
  restErrored.newOrderError = new Error("network_down");
  const errored: EventInput[] = [];
  const errorExecution = new LiveExecution.BinanceLiveExecution((event) => { errored.push(event); }, () => undefined, { config: liveTestConfig, rest: restErrored, nowMs: () => 1_700_000_000_000 });
  errorExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(errorExecution);

  await assert.rejects(() => errorExecution.submitOrder(liveOrderSubmitted()), /network_down/);
  assert.equal(errored[0]?.eventType, "EXECUTION_ERROR");
  assert.equal(errored[0]?.payload.reason, "network_down");
});

test("fatal Binance auth errors trigger fatal shutdown lifecycle", async () => {
  const rest = new MockBinanceRest();
  rest.newOrderError = new BinanceRestError("auth_failed", 403, -2015, "Invalid API-key", "/fapi/v1/order");
  const emitted: EventInput[] = [];
  const lifecycle: LiveExecution.BinanceLiveExecutionLifecycleEvent[] = [];
  const liveExecution = new LiveExecution.BinanceLiveExecution(
    (event) => { emitted.push(event); },
    (event) => { lifecycle.push(event); },
    { config: liveTestConfig, rest, nowMs: () => 1_700_000_000_000 }
  );
  liveExecution.observeDailyRealizedPnl("BTCUSDT", 0, 1_700_000_000_000);
  await refreshLiveExecutionSnapshot(liveExecution);

  await assert.rejects(() => liveExecution.submitOrder(liveOrderSubmitted()), /auth_failed/);
  assert.equal(lifecycle[0]?.action, "fatal_shutdown");
  assert.equal(emitted[0]?.eventType, "EXECUTION_ERROR");
  assert.equal(emitted[0]?.payload.reason, "fatal_exchange_auth_state");
});

test("runtime refuses DRY_RUN order submission after mismatch SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "order_4",
    payload: { quantity: 6, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "account_update",
    payload: { quantity: 1, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "signal_after_mismatch",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);

  await runtime.stop();
});

test("audit logs SAFE_MODE entry", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1, sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite") };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  const staleTimestamp = Date.now() - 10_000;

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_audit_safe",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_audit_safe",
    causationId: "signal_audit_safe",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const safeMode = audit.entries("safe_mode_entered");
  assert.equal(safeMode.length, 1);
  assert.equal(safeMode[0]?.eventType, "INTENT_CREATED");
  assert.equal(safeMode[0]?.correlationId, "corr_audit_safe");
  assert.equal(safeMode[0]?.reason, "stale_data_halt");

  await runtime.stop();
});

test("runtime refuses simulated order submission in SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_5",
    causationId: "signal_4",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_5",
    causationId: "signal_5",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  assert.deepEqual(published.map((event) => event.eventType), ["SAFE_MODE", "SAFE_MODE"]);
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  await runtime.stop();
});

test("audit logs DRY_RUN order simulation", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_audit_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_audit_order",
    causationId: "signal_audit_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const dryRun = audit.entries("dry_run_order_submitted_generated");
  assert.equal(dryRun.length, 1);
  assert.equal(dryRun[0]?.seq, 3);
  assert.equal(dryRun[0]?.eventType, "ORDER_SUBMITTED");
  assert.equal(dryRun[0]?.correlationId, "corr_audit_order");

  await runtime.stop();
});

test("runtime sends Telegram alerts through notifier integration", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true };
  const notifier = new MemoryNotifier();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, notifier });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_alerts",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_alerts",
    causationId: "signal_alerts",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.stop();

  assert.equal(notifier.messages.some((message) => message.includes("WebSocket reconnecting")), true);
  assert.equal(notifier.messages.some((message) => message.includes("WebSocket disconnected")), true);
  assert.equal(notifier.messages.some((message) => message.includes("SAFE_MODE activated")), true);
});

test("runtime Telegram alerts use configured Thai message catalog", async () => {
  const config = { ...baseConfig, telegramLanguage: "th" as const };
  const notifier = new MemoryNotifier();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), notifier });

  await runtime.start();
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.stop();

  assert.equal(notifier.messages.some((message) => message.includes("ระบบเข้า SAFE MODE")), true);
});

test("SAFE_MODE alert routes to Telegram and runtime journal", async () => {
  const notifier = new MemoryNotifier();
  const journal = new RuntimeJournal();
  const timeline = new RuntimeTimeline();
  const runtime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    notifier,
    runtimeJournal: journal,
    runtimeTimeline: timeline
  });

  await runtime.start();
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });

  assert.equal(notifier.messages.some((message) => message.includes("SAFE_MODE activated")), true);
  const journalAlert = journal.all().find((entry) => entry.type === "structured_alert");
  assert.equal(journalAlert?.payload.alert !== undefined, true);
  assert.equal((journalAlert?.payload.alert as { kind?: string } | undefined)?.kind, "safe_mode");
  const timelineAlert = timeline.all().find((entry) => entry.payload.kind === "safe_mode");
  assert.equal(timelineAlert !== undefined, true);
  const journalTimeline = journal.all().find((entry) =>
    entry.type === "timeline_entry" &&
    (entry.payload.timelineEntry as { payload?: { kind?: string } } | undefined)?.payload?.kind === "safe_mode"
  );
  assert.equal((journalTimeline?.payload.timelineEntry as { timelineSeq?: number } | undefined)?.timelineSeq, timelineAlert?.timelineSeq);

  await runtime.stop();
});

test("duplicate warning alert is deduplicated through alert pipeline", async () => {
  const notifier = new MemoryNotifier();
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    audit,
    notifier
  });

  await runtime.start();
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });

  assert.equal(notifier.messages.filter((message) => message.includes("WebSocket reconnecting")).length, 1);
  assert.equal(audit.entries("alert_deduplicated").length, 1);

  await runtime.stop();
});

test("Telegram alert send failure is audited without crashing runtime", async () => {
  const notifier = new FailingNotifier();
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    audit,
    notifier
  });

  await runtime.start();
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await Promise.resolve();

  assert.equal(notifier.attempts, 1);
  assert.equal(audit.entries("telegram_alert_send_failed").length, 1);
  assert.equal(runtime.state.mode(), "NORMAL");

  await runtime.stop();
});

test("generated ORDER_SUBMITTED is persisted and audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_persist_audit_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_persist_audit_order",
    causationId: "signal_persist_audit_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const submitted = eventStore.events.find((event) => event.eventType === "ORDER_SUBMITTED");
  assert.equal(submitted?.source, "execution");
  assert.equal(submitted?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);
  assert.equal(audit.entries("event_accepted").some((entry) => entry.eventType === "ORDER_SUBMITTED"), true);

  await runtime.stop();
});

test("DRY_RUN order can generate simulated paper fill", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 5 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_paper_fill",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_paper_fill",
    causationId: "signal_paper_fill",
    payload: { side: "BUY", type: "MARKET", quantity: 2, topOfBookQuantity: 10 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "MARKET_TICK",
    "INTENT_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_FILLED"
  ]);
  const fill = eventStore.events[3];
  assert.equal(fill?.source, "execution");
  assert.equal(fill?.payload.status, "FILLED");
  assert.equal(fill?.payload.simulator, "paper_fill");
  assert.equal(fill?.payload.slippageBps, 5);
  assert.equal(fill?.payload.price, 101 * 1.0005);
  assert.equal(audit.entries("paper_fill_generated").length, 1);

  const health = runtime.healthSnapshot();
  assert.equal(health.paperFillsGenerated, 1);
  assert.equal(health.simulatedSlippageBps, 5);
  assert.equal(health.simulatedNotionalUsd, 2 * 101 * 1.0005);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("simulated paper fill updates PortfolioState", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 0 };
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_paper_portfolio",
    causationId: "market",
    payload: { bidPrice: 200, askPrice: 201 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_paper_portfolio",
    causationId: "signal_paper_portfolio",
    payload: { side: "BUY", type: "MARKET", quantity: 3, topOfBookQuantity: 10 }
  });

  const position = runtime.portfolio.snapshot().positions.ETHUSDT;
  assert.equal(position?.quantity, 3);
  assert.equal(position?.averagePrice, 201);
  assert.equal(runtime.portfolio.exposureUsd(), 603);

  await runtime.stop();
});

test("missing market snapshot prevents paper fill generation", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_missing_snapshot",
    causationId: "market",
    payload: { price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_missing_snapshot",
    causationId: "signal_missing_snapshot",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(audit.entries("paper_fill_skipped").length, 1);
  assert.equal(audit.entries("paper_fill_skipped")[0]?.reason, "missing_market_snapshot");
  assert.equal(runtime.healthSnapshot().paperFillsGenerated, 0);

  await runtime.stop();
});

test("SAFE_MODE and HALTED prevent paper fills", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 0 };
  const safeAudit = new MemoryAuditLog();
  const safeStore = new MemoryEventStore();
  const safeRuntime = new TradingRuntime({ config, logger: createLogger(config), eventStore: safeStore, audit: safeAudit });

  await safeRuntime.start();
  await safeRuntime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_safe_paper_fill",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  safeRuntime.transitionMode("SAFE_MODE");
  await safeRuntime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_SUBMITTED",
    correlationId: "corr_safe_paper_fill",
    causationId: "manual_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1, status: "SUBMITTED" }
  });

  assert.deepEqual(safeStore.events.map((event) => event.eventType), ["MARKET_TICK", "ORDER_SUBMITTED"]);
  assert.equal(safeAudit.entries("paper_fill_skipped")[0]?.reason, "runtime_mode_disallows_paper_fill");
  assert.equal(safeRuntime.healthSnapshot().paperFillsGenerated, 0);
  await safeRuntime.stop();

  const haltedStore = new MemoryEventStore();
  const haltedRuntime = new TradingRuntime({ config, logger: createLogger(config), eventStore: haltedStore });
  await haltedRuntime.start();
  haltedRuntime.transitionMode("HALTED");
  await assert.rejects(
    haltedRuntime.ingest({
      source: "execution",
      symbol: "BTCUSDT",
      eventType: "ORDER_SUBMITTED",
      correlationId: "corr_halted_paper_fill",
      causationId: "manual_order",
      payload: { side: "BUY", type: "MARKET", quantity: 1, status: "SUBMITTED" }
    }),
    /runtime_shutdown/
  );
  assert.equal(haltedStore.events.length, 0);
  assert.equal(haltedRuntime.healthSnapshot().paperFillsGenerated, 0);
  await haltedRuntime.stop();
});

test("paper performance long fill updates exposure and average price", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_long",
    causationId: "order_perf_long",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.currentExposureUsd, 200);
  assert.equal(snapshot.averageFillPrice, 100);
  assert.equal(snapshot.positions.BTCUSDT?.quantity, 2);
  assert.equal(snapshot.positions.BTCUSDT?.averagePrice, 100);
  assert.equal(audit.entries("paper_performance_updated").length, 1);
  assert.equal(eventStore.events[0]?.eventType, "ORDER_FILLED");

  await runtime.stop();
});

test("paper performance closing fill realizes PnL", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_win",
    causationId: "order_perf_open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_win",
    causationId: "order_perf_close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -2, price: 110, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, 20);
  assert.equal(snapshot.totalTrades, 1);
  assert.equal(snapshot.winningTrades, 1);
  assert.equal(snapshot.losingTrades, 0);
  assert.equal(snapshot.winRate, 1);
  assert.equal(snapshot.grossProfitUsd, 20);
  assert.equal(snapshot.currentExposureUsd, 0);

  const health = runtime.healthSnapshot();
  assert.equal(health.paperRealizedPnlUsd, 20);
  assert.equal(health.paperWinRate, 1);

  await runtime.stop();
});

test("paper performance losing trade updates gross loss", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "ETHUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_loss",
    causationId: "order_loss_open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "ETHUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_loss",
    causationId: "order_loss_close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 90, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, -10);
  assert.equal(snapshot.totalTrades, 1);
  assert.equal(snapshot.winningTrades, 0);
  assert.equal(snapshot.losingTrades, 1);
  assert.equal(snapshot.grossLossUsd, 10);
  assert.equal(snapshot.winRate, 0);

  await runtime.stop();
});

test("paper performance max drawdown updates correctly", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "open_win",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "close_win",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 110, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "open_loss",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "close_loss",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 85, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, -5);
  assert.equal(snapshot.grossProfitUsd, 10);
  assert.equal(snapshot.grossLossUsd, 15);
  assert.equal(snapshot.maxDrawdownUsd, 15);
  assert.equal(runtime.healthSnapshot().paperMaxDrawdownUsd, 15);

  await runtime.stop();
});

test("paper performance snapshot is replay-safe", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_replay",
    causationId: "open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_replay",
    causationId: "close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -2, price: 105, status: "FILLED" }
  });

  assert.deepEqual(runtime.replayPersisted(), []);
  assert.deepEqual(runtime.paperPerformanceSnapshot(), PaperPerformanceTracker.replay(eventStore.events));

  await runtime.stop();
});

test("runtime refuses simulated order submission in HALTED", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_halted",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  runtime.transitionMode("HALTED");
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "INTENT_CREATED",
      correlationId: "corr_halted",
      causationId: "signal_halted",
      payload: { side: "BUY", type: "MARKET", quantity: 1 }
    }),
    /runtime_shutdown/
  );

  assert.equal(runtime.state.mode(), "HALTED");
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);

  await runtime.stop();
});

test("stop is idempotent and ends in HALTED", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.stop();
  await runtime.stop();

  assert.equal(runtime.state.mode(), "HALTED");
  assert.equal(eventStore.closeCount, 1);
});

test("ingest after stop is rejected", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.stop();

  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_after_stop",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /runtime_shutdown/
  );
});

test("pending events are completed before shutdown finishes", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  let releaseHandler!: () => void;
  let handlerStarted!: () => void;
  const handlerStartedPromise = new Promise<void>((resolve) => {
    handlerStarted = resolve;
  });
  const releaseHandlerPromise = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });
  runtime.events.onEvent(async () => {
    handlerStarted();
    await releaseHandlerPromise;
  });

  await runtime.start();
  const ingestPromise = runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_pending_shutdown",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await handlerStartedPromise;

  let stopFinished = false;
  const stopPromise = runtime.stop().then(() => {
    stopFinished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(stopFinished, false);

  releaseHandler();
  await Promise.all([ingestPromise, stopPromise]);

  assert.equal(stopFinished, true);
  assert.equal(runtime.state.mode(), "HALTED");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(eventStore.closeCount, 1);
});

test("runtime rejects events that fail canonical RuntimeEvent validation", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "",
      eventType: "MARKET_TICK",
      correlationId: "corr_6",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /Too small/
  );
  assert.equal(eventStore.events.length, 0);
  await runtime.stop();
});

test("persisted events can be replayed in order", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("runtime resumes sequence after persisted events", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1, "persisted_1"));
  eventStore.append(eventWithSeq(2, "persisted_2"));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    eventId: "fresh_3",
    timestamp: 1_700_000_000_100,
    receiveTimestamp: 1_700_000_000_100,
    processingTimestamp: 1_700_000_000_100,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_fresh",
    causationId: "test",
    payload: { bid: 110, ask: 111 }
  });

  assert.equal(eventStore.events.at(-1)?.seq, 3);
  await runtime.stop();
});

test("runtime deduplicates repeated operational alerts", async () => {
  const notifier = new MemoryNotifier();
  const clock = {
    nowMs: () => 10_000,
    monotonicMs: () => 10_000
  };
  const runtime = new TradingRuntime({
    config: { ...baseConfig, staleDataHaltMs: 100 },
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    notifier,
    clock
  });

  await runtime.start();
  await runtime.ingest({
    eventId: "stale_market",
    timestamp: 1_000,
    receiveTimestamp: 1_000,
    processingTimestamp: 1_000,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_stale_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    eventId: "stale_intent_1",
    timestamp: 10_000,
    receiveTimestamp: 10_000,
    processingTimestamp: 10_000,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_stale_2",
    causationId: "test",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  await runtime.ingest({
    eventId: "stale_intent_2",
    timestamp: 10_000,
    receiveTimestamp: 10_000,
    processingTimestamp: 10_000,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_stale_3",
    causationId: "test",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.equal(notifier.messages.filter((message) => message.includes("SAFE_MODE")).length, 1);
  await runtime.stop();
});

test("audit logs replay success and failure", async () => {
  const successAudit = new MemoryAuditLog();
  const successStore = new MemoryEventStore();
  successStore.append(eventWithSeq(1));
  successStore.append(eventWithSeq(2));
  const successRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: successStore, audit: successAudit });

  assert.deepEqual(successRuntime.replayPersisted(), []);
  assert.equal(successAudit.entries("replay_started").length, 1);
  assert.equal(successAudit.entries("replay_completed").length, 1);
  await successRuntime.stop();

  const failureAudit = new MemoryAuditLog();
  const failureStore = new MemoryEventStore();
  failureStore.append(eventWithSeq(1));
  failureStore.append(eventWithSeq(1));
  const failureRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: failureStore, audit: failureAudit });

  assert.deepEqual(failureRuntime.replayPersisted(), [{ seq: 1, reason: "duplicate" }]);
  const failed = failureAudit.entries("replay_failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.seq, 1);
  assert.equal(failed[0]?.reason, "duplicate");
  await failureRuntime.stop();
});

test("duplicate seq fails replay", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), [{ seq: 2, reason: "duplicate" }]);

  await runtime.stop();
});

test("out-of-order seq fails replay", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(3));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), [{ seq: 2, reason: "out_of_order" }]);

  await runtime.stop();
});

test("replay cannot run from unsafe mode", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  runtime.transitionMode("SAFE_MODE");
  assert.throws(() => {
    runtime.replayPersisted();
  }, /invalid_runtime_transition:SAFE_MODE->REPLAY/);
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("replay duplicate bypass works only in replay mode", async () => {
  const normalStore = new MemoryEventStore();
  const normalRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: normalStore });
  await normalRuntime.start();
  await normalRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"));
  await assert.rejects(
    normalRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true }),
    /duplicate_seq:1/
  );
  await normalRuntime.stop();

  const replayStore = new MemoryEventStore();
  const replayRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: replayStore });
  replayRuntime.transitionMode("REPLAY");
  await replayRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true });
  await replayRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true });

  assert.deepEqual(replayStore.events.map((event) => event.seq), [1, 1]);
  assert.deepEqual(replayStore.events.map((event) => event.eventId), ["evt_replay_bypass", "evt_replay_bypass"]);

  await replayRuntime.stop();
});

test("excessive processing latency triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, latencyHaltMs: 1, hotPathWarnMs: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });
  runtime.events.onEvent(async (event) => {
    if (event.eventType === "MARKET_TICK") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_latency_breach",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  const breaches = audit.entries("latency_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.eventType, "MARKET_TICK");
  assert.equal(breaches[0]?.reason, "processing_latency_halt");
  assert.equal(eventStore.events.at(-1)?.eventType, "SAFE_MODE");

  await runtime.stop();
});

test("queue overflow rejects ingest and enters SAFE_MODE", async () => {
  const config = { ...baseConfig, maxQueueDepth: 1 };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  let releaseHandler!: () => void;
  let handlerStarted!: () => void;
  const handlerStartedPromise = new Promise<void>((resolve) => {
    handlerStarted = resolve;
  });
  const releaseHandlerPromise = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });
  runtime.events.onEvent(async () => {
    handlerStarted();
    await releaseHandlerPromise;
  });

  await runtime.start();
  const firstIngest = runtime.ingest({
    seq: 1,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_queue_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await handlerStartedPromise;
  const secondIngest = runtime.ingest({
    seq: 2,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_queue_2",
    causationId: "test",
    payload: { bid: 102, ask: 103 }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await assert.rejects(
    runtime.ingest({
      seq: 3,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_queue_3",
      causationId: "test",
      payload: { bid: 104, ask: 105 }
    }),
    /queue_depth_exceeded:1/
  );
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(audit.entries("backpressure_breach").length, 1);

  releaseHandler();
  await Promise.all([firstIngest, secondIngest]);
  await runtime.stop();
});

test("replay lag triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, maxReplayLag: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  assert.deepEqual(runtime.replayPersisted(), []);
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  const breaches = audit.entries("replay_lag_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.replayLag, 3);
  assert.equal(breaches[0]?.reason, "replay_lag_halt");

  await runtime.stop();
});

test("transient latency spike audits warning without SAFE_MODE", async () => {
  const config = { ...baseConfig, hotPathWarnMs: 1, latencyHaltMs: 100 };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  runtime.events.onEvent(async (event) => {
    if (event.eventType === "MARKET_TICK") {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_latency_warning",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  const warnings = audit.entries("latency_warning");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.reason, "transient_processing_latency");

  await runtime.stop();
});

test("runtime health metrics count processed and rejected events", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    seq: 1,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_metrics_accepted",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      seq: 1,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_metrics_rejected",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_seq:1/
  );

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 1);
  assert.equal(health.eventsRejected, 1);
  assert.equal(health.queueDepth, 0);
  assert.equal(health.maxQueueDepthObserved, 0);
  assert.equal(health.mode, "NORMAL");
  assert.equal(health.running, true);

  await runtime.stop();
});

test("signal providers can register", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const firstProvider: SignalProvider = {
    id: "test_signal_provider_1",
    evaluate: () => []
  };
  const secondProvider: SignalProvider = {
    id: "test_signal_provider_2",
    evaluate: () => []
  };

  runtime.registerSignalProvider(firstProvider);
  runtime.registerSignalProvider(secondProvider);

  assert.deepEqual(runtime.signals.listProviders().map((provider) => provider.id), [
    "test_signal_provider_1",
    "test_signal_provider_2"
  ]);
  assert.throws(() => runtime.registerSignalProvider(firstProvider), /signal_provider_duplicate:test_signal_provider_1/);

  await runtime.stop();
});

test("spread widening provider generates canonical SIGNAL_CREATED", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider(new SpreadWideningSignalProvider(50));

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_spread_signal",
    causationId: "market",
    payload: { bidPrice: 100, askPrice: 102 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["BOOK_UPDATE", "SIGNAL_CREATED"]);
  const signal = eventStore.events[1];
  assert.equal(signal?.source, "runtime");
  assert.equal(signal?.symbol, "BTCUSDT");
  assert.equal(signal?.correlationId, "corr_spread_signal");
  assert.equal(signal?.causationId, "1");
  assert.equal(signal?.payload.providerId, "spread_widening_detector");
  assert.equal(signal?.payload.signalType, "SPREAD_WIDENING");
  assert.equal(audit.entries("event_accepted").length, 2);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 2);
  assert.equal(health.signalsGenerated, 1);
  assert.equal(health.signalsRejected, 0);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("invalid signal outputs are rejected without rejecting market event", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider({
    id: "invalid_signal_provider",
    evaluate: () => [
      {
        signalType: "INVALID_SIGNAL",
        symbol: "",
        payload: { reason: "test_invalid_symbol" }
      }
    ]
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_invalid_signal",
    causationId: "market",
    payload: { bid: 100, ask: 105 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(audit.entries("event_rejected").length, 1);
  assert.equal(audit.entries("signal_rejected").length, 1);
  assert.match(audit.entries("signal_rejected")[0]?.reason ?? "", /Too small/);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 1);
  assert.equal(health.eventsRejected, 1);
  assert.equal(health.signalsGenerated, 0);
  assert.equal(health.signalsRejected, 1);

  await runtime.stop();
});

test("default SignalToIntentPolicy rejects signal conversion", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_default_signal_intent",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "runtime",
    symbol: "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_default_signal_intent",
    causationId: "1",
    payload: { providerId: "test", signalType: "SPREAD_WIDENING", confidence: 1 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SIGNAL_CREATED"]);
  assert.equal(audit.entries("signal_intent_rejected").length, 1);
  assert.equal(audit.entries("signal_intent_rejected")[0]?.reason, "signal_to_intent_disabled");
  assert.equal(eventStore.events.some((event) => event.eventType === "INTENT_CREATED"), false);

  await runtime.stop();
});

test("test SignalToIntentPolicy generates INTENT_CREATED and DRY_RUN ORDER_SUBMITTED", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider(new SpreadWideningSignalProvider(50));
  runtime.registerSignalToIntentPolicy(testSignalToIntentPolicy);

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_test_signal_intent",
    causationId: "market",
    payload: { bidPrice: 100, askPrice: 102 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "BOOK_UPDATE",
    "SIGNAL_CREATED",
    "INTENT_CREATED",
    "ORDER_SUBMITTED"
  ]);
  assert.equal(eventStore.events[2]?.source, "runtime");
  assert.equal(eventStore.events[2]?.payload.policyId, "test_signal_to_intent_policy");
  assert.equal(eventStore.events[3]?.source, "execution");
  assert.equal(eventStore.events[3]?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("signal_intent_generated").length, 1);
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 4);
  assert.equal(health.signalsGenerated, 1);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("SAFE_MODE blocks signal-to-intent conversion", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalToIntentPolicy(testSignalToIntentPolicy);

  await runtime.start();
  runtime.transitionMode("SAFE_MODE");
  await runtime.ingest({
    source: "runtime",
    symbol: "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_safe_signal_intent",
    causationId: "test",
    payload: { providerId: "test", signalType: "SPREAD_WIDENING", confidence: 1 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["SIGNAL_CREATED"]);
  assert.equal(eventStore.events.some((event) => event.eventType === "INTENT_CREATED"), false);
  assert.equal(eventStore.events.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  assert.equal(audit.entries("signal_intent_rejected").length, 1);
  assert.equal(audit.entries("signal_intent_rejected")[0]?.reason, "runtime_mode_disallows_signal_intent");

  await runtime.stop();
});

test("runtime health metrics count SAFE_MODE and websocket reconnects", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "order_book",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketDataAdapterLifecycle({
    adapterId: "generic-market-adapter",
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "order_book",
    reason: "websocket_disconnect"
  });

  const health = runtime.healthSnapshot();
  assert.equal(health.websocketReconnectCount, 1);
  assert.equal(health.safeModeCount, 1);
  assert.equal(health.mode, "SAFE_MODE");
  assert.equal(eventStore.events[0]?.eventType, "SAFE_MODE");

  await runtime.stop();
});

test("exchange authority hierarchy downgrades lower authority conflicts", () => {
  const audit = new MemoryAuditLog();
  const local: AuthoritativeState = {
    authority: "WEBSOCKET_ORDER_UPDATE",
    state: { symbol: "BTCUSDT", orderId: "1", status: "NEW" },
    evidenceId: "ws_order",
    observedAt: 1
  };
  const rest: AuthoritativeState = {
    authority: "REST_ORDER_STATE",
    state: { symbol: "BTCUSDT", orderId: "1", status: "FILLED" },
    evidenceId: "rest_order",
    observedAt: 2
  };

  const resolved = resolveConflict(local, rest, audit);
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.selectedAuthority, "REST_ORDER_STATE");
  assert.equal(resolved.state.status, "FILLED");
  assert.equal(audit.entries("CONFIDENCE_DOWNGRADE").length, 1);
});

test("equal authority identity conflict requires halt", () => {
  const resolved = resolveConflict(
    { authority: "REST_ORDER_STATE", state: { orderId: "1", status: "NEW" }, evidenceId: "a", observedAt: 1 },
    { authority: "REST_ORDER_STATE", state: { orderId: "2", status: "NEW" }, evidenceId: "b", observedAt: 2 }
  );
  assert.equal(resolved.status, "HALT_REQUIRED");
  assert.match(resolved.reason, /unresolvable_equal_authority_conflict/);
});

test("causal exchange ingest audits clock skew and causal uncertainty", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const config = { ...baseConfig, clockSkewAlertMs: 10 };
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  await runtime.ingestExternalMarketEvent({
    eventId: "market-data-adapter:trade:BTCUSDT:1",
    timestamp: 1_000,
    exchangeTimestamp: 1_000,
    receiveTimestamp: 2_000,
    source: "market_data_adapter",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_causal",
    causationId: "generic-market-adapter",
    payload: { marketDataKind: "trade", tradeId: 1, price: 100, quantity: 1, sequence_id: 1 }
  });

  assert.equal(audit.entries("CLOCK_SKEW_ALERT").length, 1);
  assert.equal(eventStore.events[0]?.payload.exchange_time, 1_000);
  assert.equal(eventStore.events[0]?.payload.received_time, 2_000);
});

test("payload trust scoring rejects unsafe exchange payloads", () => {
  const assessment = new PayloadTrustScorer().assess({
    timestamp: 1,
    source: "binance_market_ws",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_trust",
    causationId: "exchange",
    payload: { price: Number.NaN }
  });
  assert.equal(assessment.acceptanceDecision, "REJECT");
  assert.ok(assessment.flags.includes("non_finite_numeric_payload"));
});

test("truth confidence governance maps degraded disputed and unknown states", () => {
  assert.equal(truthConfidenceState({ causalUncertaintyCount: 0, confidenceDowngradeCount: 0, disputed: false, unknown: false }).confidence, "HIGH_CONFIDENCE");
  assert.equal(truthConfidenceState({ causalUncertaintyCount: 1, confidenceDowngradeCount: 0, disputed: false, unknown: false }).positionSizeMultiplier, 0.5);
  assert.equal(truthConfidenceState({ causalUncertaintyCount: 0, confidenceDowngradeCount: 0, disputed: true, unknown: false }).haltNewOrders, true);
  assert.equal(truthConfidenceState({ causalUncertaintyCount: 0, confidenceDowngradeCount: 0, disputed: false, unknown: true }).enterSafeMode, true);
});

test("operator override ledger enforces quota dual authorization and immutability", () => {
  const ledger = new OperatorOverrideLedger({ quotaPer24h: 1 });
  const record = ledger.append({
    overrideId: "ovr_1",
    operatorId: "op_1",
    secondaryOperatorId: "op_2",
    severity: "HIGH",
    action: "release_quarantine",
    reason: "manual verified",
    timestamp: 1_700_000_000_000,
    evidenceIds: ["ev_override"]
  });
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => ledger.append({
    overrideId: "ovr_2",
    operatorId: "op_1",
    severity: "LOW",
    action: "override",
    reason: "quota check",
    timestamp: 1_700_000_000_001,
    evidenceIds: ["ev_override_2"]
  }), /operator_override_quota_exceeded/);
  assert.throws(() => new OperatorOverrideLedger({ quotaPer24h: 2 }).append({
    overrideId: "ovr_3",
    operatorId: "op_1",
    severity: "HIGH",
    action: "override",
    reason: "dual check",
    timestamp: 1,
    evidenceIds: ["ev_override_3"]
  }), /high_severity_override_requires_dual_authorization/);
});

test("runtime state machine declares economically unviable transition metadata", () => {
  const state = new RuntimeStateMachine("PAPER");
  state.transition("ECONOMICALLY_UNVIABLE", ["negative_net_edge"]);
  assert.equal(state.mode(), "ECONOMICALLY_UNVIABLE");
  const rule = transitionRule("PAPER", "ECONOMICALLY_UNVIABLE");
  assert.equal(rule.authorization, "auto");
  assert.deepEqual(rule.requiredEvidence, ["negative_net_edge"]);
  assert.throws(() => state.transition("NORMAL"), /invalid_runtime_transition:ECONOMICALLY_UNVIABLE->NORMAL/);
});

test("config fingerprint is deterministic and changes on mutation", () => {
  const first = configFingerprint(baseConfig);
  const second = configFingerprint({ ...baseConfig });
  const mutated = configFingerprint({ ...baseConfig, maxOrderNotionalUsd: baseConfig.maxOrderNotionalUsd + 1 });
  assert.equal(first, second);
  assert.notEqual(first, mutated);
});

test("process survivability monitors heap gc queues and restart reverification", () => {
  const monitor = new ProcessSurvivabilityMonitor({
    maxHeapUtilization: 0.8,
    maxGcPauseRatio: 0.1,
    maxQueueUtilization: 0.75,
    restartCadenceMs: 1_000,
    maxSurvivabilityCpuMemoryRatio: 0.15
  });
  const first = monitor.observe("runtime_a", {
    timestamp: 1_000,
    heapUsedBytes: 70,
    heapLimitBytes: 100,
    gcPauseMs: 5,
    windowMs: 100,
    asyncQueueDepth: 2,
    asyncQueueCapacity: 10,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1
  }, ["ev_process_1"]);
  assert.equal(first.status, "PROCESS_SURVIVABILITY_OK");

  const due = monitor.observe("runtime_a", {
    timestamp: 2_000,
    heapUsedBytes: 90,
    heapLimitBytes: 100,
    gcPauseMs: 20,
    windowMs: 100,
    asyncQueueDepth: 9,
    asyncQueueCapacity: 10,
    cpuOverheadRatio: 0.16,
    memoryOverheadRatio: 0.16
  }, ["ev_process_2"]);
  assert.equal(due.status, "DETERMINISTIC_RESTART_REQUIRED");
  assert.ok(due.reasons.includes("heap_pressure"));
  assert.ok(due.reasons.includes("deterministic_restart_cadence_due"));

  const verified = monitor.verifyRestart("runtime_a", 2_001, true, ["ev_reverify"]);
  assert.equal(verified.status, "RESTART_REVERIFIED");
  assert.equal(monitor.verifyEvidence(), true);
});

test("process survivability emits rolling p50 p95 p99 and memory leak heuristic", () => {
  const monitor = new ProcessSurvivabilityMonitor({
    maxHeapUtilization: 0.95,
    maxGcPauseRatio: 0.5,
    maxQueueUtilization: 0.9,
    restartCadenceMs: 10_000,
    maxSurvivabilityCpuMemoryRatio: 0.15,
    rollingWindowSize: 5,
    memoryLeakSlopeBytesPerSample: 10
  });
  let decision = monitor.observe("runtime_metrics", {
    timestamp: 1,
    heapUsedBytes: 100,
    heapLimitBytes: 1_000,
    gcPauseMs: 1,
    windowMs: 100,
    asyncQueueDepth: 1,
    asyncQueueCapacity: 100,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1,
    eventLoopLagMs: 1,
    timerDriftMs: 2,
    websocketProcessingLatencyMs: 3,
    reconciliationLatencyMs: 4
  }, ["ev_process_metrics_1"]);
  for (let index = 2; index <= 5; index += 1) {
    decision = monitor.observe("runtime_metrics", {
      timestamp: index,
      heapUsedBytes: 100 + index * 100,
      heapLimitBytes: 1_000,
      gcPauseMs: index,
      windowMs: 100,
      asyncQueueDepth: index,
      asyncQueueCapacity: 100,
      cpuOverheadRatio: 0.1,
      memoryOverheadRatio: 0.1,
      eventLoopLagMs: index,
      timerDriftMs: index,
      websocketProcessingLatencyMs: index,
      reconciliationLatencyMs: index
    }, [`ev_process_metrics_${index}`]);
  }
  assert.equal(decision.memoryLeakSuspected, true);
  assert.equal(decision.rollingMetrics.eventLoopLag.p50, 3);
  assert.equal(decision.rollingMetrics.eventLoopLag.p95, 5);
  assert.equal(decision.rollingMetrics.eventLoopLag.p99, 5);
});

test("event loop lag monitor detects timer drift deterministically", () => {
  const lag = new EventLoopLagMonitor(100);
  assert.deepEqual(lag.sample(1_000), { eventLoopLagMs: 0, timerDriftMs: 0 });
  assert.deepEqual(lag.sample(1_175), { eventLoopLagMs: 75, timerDriftMs: 75 });
});

test("GC pause instrumentation exposes perf_hooks collector lifecycle", () => {
  const gc = new GcPauseInstrumentation();
  gc.start();
  assert.equal(gc.drainPauseMs(), 0);
  gc.stop();
});

test("runtime survivability emits latency and process degradation evidence", () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });
  runtime.observeProcessSurvivability({
    timestamp: 1_700_000_000_000,
    heapUsedBytes: 100,
    heapLimitBytes: 1_000,
    gcPauseMs: 200,
    windowMs: 1_000,
    asyncQueueDepth: 1,
    asyncQueueCapacity: 100,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1,
    activeTrading: true
  });
  runtime.observeProcessSurvivability({
    timestamp: 1_700_000_000_001,
    heapUsedBytes: 100,
    heapLimitBytes: 1_000,
    gcPauseMs: 1,
    windowMs: 1_000,
    asyncQueueDepth: 1,
    asyncQueueCapacity: 100,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1,
    eventLoopLagMs: 200
  });
  assert.equal(audit.entries("LATENCY_ALERT").length, 1);
  assert.equal(audit.entries("PROCESS_DEGRADED").some((entry) => entry.reason === "event_loop_blocked"), true);
});

test("runtime survivability enters SAFE_MODE on reconciliation starvation and queue explosion", () => {
  const reconciliationAudit = new MemoryAuditLog();
  const reconciliationRuntime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    audit: reconciliationAudit
  });
  reconciliationRuntime.observeProcessSurvivability({
    timestamp: 1_700_000_000_000,
    heapUsedBytes: 100,
    heapLimitBytes: 1_000,
    gcPauseMs: 1,
    windowMs: 1_000,
    asyncQueueDepth: 1,
    asyncQueueCapacity: 100,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1,
    reconciliationBlockedMs: 1_000
  });
  assert.equal(reconciliationRuntime.state.mode(), "SAFE_MODE");
  assert.equal(reconciliationAudit.entries("PROCESS_DEGRADED").some((entry) => entry.reason === "reconciliation_starvation"), true);

  const queueAudit = new MemoryAuditLog();
  const queueRuntime = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: new MemoryEventStore(),
    audit: queueAudit
  });
  queueRuntime.observeProcessSurvivability({
    timestamp: 1_700_000_000_000,
    heapUsedBytes: 100,
    heapLimitBytes: 1_000,
    gcPauseMs: 1,
    windowMs: 1_000,
    asyncQueueDepth: 96,
    asyncQueueCapacity: 100,
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1
  });
  assert.equal(queueRuntime.state.mode(), "SAFE_MODE");
  assert.equal(queueAudit.entries("PROCESS_DEGRADED").some((entry) => entry.reason === "async_queue_explosion_halt_new_trading"), true);
});

test("deterministic restart coordinator blocks unsafe restart windows", () => {
  const monitor = new ProcessSurvivabilityMonitor({ restartCadenceMs: 1_000 });
  const coordinator = new DeterministicRestartCoordinator(monitor);
  const blocked = coordinator.coordinate({
    runtimeId: "runtime_restart",
    now: 1_000,
    context: {
      openPositions: true,
      disputedTruth: true,
      reconnectRecovery: true,
      degradedReconciliation: true,
      evidenceIds: ["ev_restart_blocked"]
    },
    state: { seq: 1 }
  });
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.blockedBy, ["open_positions", "disputed_truth", "reconnect_recovery", "degraded_reconciliation"]);

  const allowed = coordinator.coordinate({
    runtimeId: "runtime_restart",
    now: 2_000,
    context: {
      openPositions: false,
      disputedTruth: false,
      reconnectRecovery: false,
      degradedReconciliation: false,
      evidenceIds: ["ev_restart_allowed"]
    },
    state: { seq: 2 }
  });
  assert.equal(allowed.eligible, true);
  assert.equal(allowed.preRestartEvidence?.status, "PRE_RESTART_EVIDENCE_PRESERVED");
});

test("edge accounting computes runtime and market edge and verifies tamper evidence", () => {
  const ledger = new Economy.EdgeAccountingLedger();
  const decision = ledger.record({
    reportId: "edge_1",
    periodStart: 1_700_000_000_000,
    periodEnd: 1_700_086_400_000,
    currency: "USD",
    strategyGrossEdgeBps: 1,
    executionQualityEdgeBps: 0.5,
    survivabilityOverheadBps: 0.2,
    reconciliationCostBps: 0.05,
    governancePenaltyBps: 0.05,
    operationalOverheadBps: 0.05,
    infrastructureComplexityCostBps: 0.05,
    edgeDecayRateBpsPerDay: 0.01,
    subsystemRoi: [{ subsystemId: "reconciliation", runtimeEdgeBps: 0.4, marketEdgeBps: 0.1, costBps: 0.1, roiRatio: 5 }],
    cpuOverheadRatio: 0.1,
    memoryOverheadRatio: 0.1,
    evidenceIds: ["ev_edge_1"]
  });

  assert.equal(decision.status, "ECONOMICALLY_VIABLE");
  assert.equal(decision.report.netRealizedEdgeBps, 1.1);
  assert.equal(ledger.verifyEvidence(), true);

  const section = buildEdgeAttributionSection(decision.report);
  assert.equal(section.section, "EDGE_ATTRIBUTION");
  assert.equal(section.prominence, "PRIMARY");
  assert.equal(section.marketEdgeBps, 1);
  assert.equal(section.runtimeEdgeBps, 0.5);
});

test("edge accounting law gates economically unviable runtime", () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });
  const decision = runtime.recordEdgeAttributionReport({
    reportId: "edge_unviable_1",
    periodStart: 1_700_000_000_000,
    periodEnd: 1_700_086_400_000,
    currency: "USD",
    strategyGrossEdgeBps: 0.02,
    executionQualityEdgeBps: 0.01,
    survivabilityOverheadBps: 0.03,
    reconciliationCostBps: 0.01,
    governancePenaltyBps: 0.01,
    operationalOverheadBps: 0.01,
    infrastructureComplexityCostBps: 0.01,
    edgeDecayRateBpsPerDay: 0.02,
    subsystemRoi: [{ subsystemId: "governance", runtimeEdgeBps: 0.01, marketEdgeBps: 0, costBps: 0.01, roiRatio: 1 }],
    cpuOverheadRatio: 0.16,
    memoryOverheadRatio: 0.1,
    evidenceIds: ["ev_edge_unviable"]
  });

  assert.equal(decision.status, "ECONOMICALLY_UNVIABLE_REQUIRED");
  assert.equal(runtime.state.mode(), "ECONOMICALLY_UNVIABLE");
  assert.equal(audit.entries("edge_attribution_report").length, 1);
  assert.equal(audit.entries("economically_unviable_entered").length, 1);
  assert.ok(decision.violations.includes("minimum_viable_net_edge_breach"));
  assert.ok(decision.violations.includes("survivability_cpu_overhead_exceeds_15_percent"));
});

test("edge accounting detects seven consecutive non-positive edge days", () => {
  const ledger = new Economy.EdgeAccountingLedger();
  const day = 24 * 60 * 60 * 1_000;
  let decision: ReturnType<Economy.EdgeAccountingLedger["record"]> | undefined;
  for (let index = 0; index < 7; index += 1) {
    decision = ledger.record({
      reportId: `edge_negative_${index}`,
      periodStart: 1_700_000_000_000 + index * day,
      periodEnd: 1_700_000_000_000 + (index + 1) * day,
      currency: "USD",
      strategyGrossEdgeBps: 0.01,
      executionQualityEdgeBps: 0,
      survivabilityOverheadBps: 0.02,
      reconciliationCostBps: 0,
      governancePenaltyBps: 0,
      operationalOverheadBps: 0,
      infrastructureComplexityCostBps: 0,
      edgeDecayRateBpsPerDay: 0.01,
      subsystemRoi: [{ subsystemId: "runtime_core", runtimeEdgeBps: 0.03, marketEdgeBps: 0, costBps: 0.01, roiRatio: 3 }],
      cpuOverheadRatio: 0.1,
      memoryOverheadRatio: 0.1,
      evidenceIds: [`ev_edge_negative_${index}`]
    });
  }
  assert.equal(decision?.consecutiveNonPositiveDays, 7);
  assert.ok(decision?.violations.includes("net_realized_edge_non_positive_7_consecutive_days"));
  Economy.assertDailyEdgeReportCadence(ledger.all());
});

test("RealityGraph appends provenance-bound evidence and assertions", () => {
  const graph = new RealityGraph({ operationalConfidenceThreshold: 0.75 });
  graph.appendEvidence({
    evidenceId: "ev_book_1",
    timestamp: 1_700_000_000_001,
    subjectId: "BTCUSDT",
    kind: "book_update",
    provenance: { source: "test", eventSeq: 1, correlationId: "corr_reality" },
    validFrom: 1_700_000_000_001,
    payload: { bid: 100, ask: 101 }
  });
  const assertion = graph.appendAssertion({
    assertionId: "as_spread_1",
    timestamp: 1_700_000_000_002,
    subjectId: "BTCUSDT",
    layer: "trusted",
    predicate: "spread_bps",
    value: 99.5,
    confidence: 0.9,
    confidenceExplanation: ["derived_from_top_of_book"],
    provenance: [{ source: "runtime", eventSeq: 1, correlationId: "corr_reality" }],
    validFrom: 1_700_000_000_001,
    degradationWeight: 0.1,
    supportingEvidence: ["ev_book_1"],
    contradictingEvidence: [],
    disputeStatus: "undisputed"
  });

  assert.equal(assertion.assertionSeq, 1);
  assert.equal(graph.allEvidence()[0]?.evidenceSeq, 1);
  assert.deepEqual(graph.validate(), []);
  assert.throws(() => {
    (assertion as { confidence: number }).confidence = 0.1;
  }, /Cannot assign to read only property/);
});

test("RealityGraph fails closed when assertion support is missing", () => {
  const graph = new RealityGraph();

  assert.throws(() =>
    graph.appendAssertion({
      assertionId: "as_missing_support",
      timestamp: 1,
      subjectId: "BTCUSDT",
      layer: "inferred",
      predicate: "market_open",
      value: true,
      confidence: 0.8,
      confidenceExplanation: ["test"],
      provenance: [{ source: "runtime", note: "unit test" }],
      validFrom: 1,
      degradationWeight: 0,
      supportingEvidence: ["missing"],
      contradictingEvidence: [],
      disputeStatus: "undisputed"
    }), /reality_assertion_integrity_uncertain:missing_supporting_evidence:missing/);
});

test("RealityGraph excludes disputed assertions from operational reality", () => {
  const graph = new RealityGraph({ operationalConfidenceThreshold: 0.7 });
  graph.appendEvidence({
    evidenceId: "ev_supported",
    timestamp: 10,
    subjectId: "BTCUSDT",
    kind: "market_tick",
    provenance: { source: "test", eventSeq: 10 },
    validFrom: 10,
    payload: { price: 100 }
  });
  graph.appendEvidence({
    evidenceId: "ev_contradiction",
    timestamp: 11,
    subjectId: "BTCUSDT",
    kind: "market_tick",
    provenance: { source: "test", eventSeq: 11 },
    validFrom: 11,
    payload: { price: 90 }
  });
  graph.appendAssertion({
    assertionId: "as_disputed",
    timestamp: 12,
    subjectId: "BTCUSDT",
    layer: "trusted",
    predicate: "last_price",
    value: 100,
    confidence: 0.95,
    confidenceExplanation: ["conflicting_ticks_present"],
    provenance: [{ source: "runtime", eventSeq: 10 }],
    validFrom: 10,
    degradationWeight: 0,
    supportingEvidence: ["ev_supported"],
    contradictingEvidence: ["ev_contradiction"],
    disputeStatus: "disputed"
  });

  assert.equal(graph.operationalReality("BTCUSDT", "last_price", 12), undefined);
});

test("RealityGraph computes degradation-weighted operational confidence deterministically", () => {
  const first = new RealityGraph({ operationalConfidenceThreshold: 0.7 });
  const second = new RealityGraph({ operationalConfidenceThreshold: 0.7 });

  for (const graph of [first, second]) {
    graph.appendEvidence({
      evidenceId: "ev_1",
      timestamp: 20,
      subjectId: "ETHUSDT",
      kind: "book_update",
      provenance: { source: "test", eventSeq: 20 },
      validFrom: 20,
      payload: { bid: 200, ask: 201 }
    });
    graph.appendEvidence({
      evidenceId: "ev_2",
      timestamp: 21,
      subjectId: "ETHUSDT",
      kind: "book_update",
      provenance: { source: "test", eventSeq: 21 },
      validFrom: 21,
      payload: { bid: 202, ask: 203 }
    });
    graph.appendAssertion({
      assertionId: "as_old",
      timestamp: 22,
      subjectId: "ETHUSDT",
      layer: "trusted",
      predicate: "liquidity_state",
      value: "normal",
      confidence: 0.99,
      confidenceExplanation: ["initial_depth_sufficient"],
      provenance: [{ source: "runtime", eventSeq: 20 }],
      validFrom: 20,
      degradationWeight: 0.1,
      supportingEvidence: ["ev_1"],
      contradictingEvidence: [],
      disputeStatus: "undisputed"
    });
    graph.appendAssertion({
      assertionId: "as_new",
      timestamp: 23,
      subjectId: "ETHUSDT",
      layer: "operational",
      predicate: "liquidity_state",
      value: "thin",
      confidence: 0.8,
      confidenceExplanation: ["latest_depth_thin"],
      provenance: [{ source: "runtime", eventSeq: 21 }],
      validFrom: 21,
      degradationWeight: 0,
      supportingEvidence: ["ev_2"],
      contradictingEvidence: [],
      disputeStatus: "undisputed"
    });
  }

  const firstReality = first.operationalReality("ETHUSDT", "liquidity_state", 24);
  const secondReality = second.operationalReality("ETHUSDT", "liquidity_state", 24);
  assert.equal(firstReality?.assertion.assertionId, "as_new");
  assert.equal(firstReality?.effectiveConfidence, 0.8);
  assert.deepEqual(firstReality, secondReality);
});

test("ObservabilityAuditLog preserves governance evidence lineage", () => {
  const audit = new ObservabilityAuditLog();
  const record = audit.governanceAction({
    timestamp: 1_000,
    trace: { traceId: "trace_obs", spanId: "span_governance" },
    subjectId: "BTCUSDT",
    policyId: "trust_policy_v1",
    reason: "trust_score_changed",
    evidenceIds: ["ev_trust_1"],
    state: { fromTrust: 0.9, toTrust: 0.4 }
  });

  assert.equal(record.auditSeq, 1);
  assert.equal(audit.all()[0]?.trace.traceId, "trace_obs");
  assert.throws(() => audit.append({
    timestamp: 1_001,
    action: "quarantine_action",
    trace: { traceId: "trace_obs", spanId: "span_quarantine" },
    subjectId: "feed_a",
    policyId: "edge_quarantine_v1",
    reason: "trust_collapse",
    evidenceIds: [],
    state: {}
  }), /degradation_or_quarantine_requires_evidence_lineage/);
});

test("Observability metrics tracing and performance budgets are deterministic", () => {
  const traces = new TracingSpanRecorder();
  traces.start({ traceId: "trace_perf", spanId: "span_1" }, "governance.evaluate", 1_000, { state: "NORMAL" });
  const ended = traces.end("span_1", 1_004, { decision: "DEGRADED" });
  const metrics = new ObservabilityMetricsCollector();
  metrics.observeDecision({
    timestamp: 1_004,
    traceId: "trace_perf",
    decisionType: "governance",
    durationMs: 4,
    queueDepth: 7,
    replayDrift: 0
  });
  const violations = new PerformanceBudgetEvaluator().evaluate({
    p99LatencyMs: 51,
    governanceEvaluationMs: 4,
    replayDrift: 0,
    memoryRssBytes: 100,
    eventQueueDepth: 81,
    eventQueueCapacity: 100
  });
  const alert = new ObservabilityAlertRules().fromBudgetViolation(1_005, "trace_perf", violations[0]!);

  assert.equal(ended.endedAt, 1_004);
  assert.equal(metrics.snapshot().gauges["runtime.queue_depth"]?.value, 7);
  assert.deepEqual(violations.map((violation) => violation.metric), ["p99LatencyMs", "eventQueueSaturation"]);
  assert.equal(alert.severity, "WARNING");
});

test("Recovery protocols degrade safely and require manual quarantine release", () => {
  const degradation = new GracefulDegradationPolicy();
  assert.deepEqual(degradation.decide({
    trustScore: 0.4,
    exchangePartitionMs: 0,
    replayDivergent: false,
    operationalRealityDisputed: false,
    governanceAvailable: true
  }).targetState, "SAFE_MODE");
  assert.deepEqual(degradation.decide({
    trustScore: 0.9,
    exchangePartitionMs: 0,
    replayDivergent: true,
    operationalRealityDisputed: false,
    governanceAvailable: true
  }).targetState, "HALTED");

  const states = new SafeStateTransitionProtocol();
  const transition = states.transition("SAFE_MODE", "trust_collapse", "trust collapsed to 0.4", 2_000, "trace_recovery");
  assert.equal(transition.from, "NORMAL");
  assert.throws(() => states.transition("NORMAL", "manual_release", "unsafe direct recovery", 2_001, "trace_recovery"), /invalid_safe_state_transition/);

  const quarantine = new QuarantineReleaseProtocol();
  quarantine.quarantine({
    sourceId: "edge_a",
    quarantinedAt: 2_000,
    traceId: "trace_recovery",
    evidenceIds: ["ev_edge_gap"],
    reason: "sequence_gap"
  });
  assert.throws(() => quarantine.release("edge_a", "operator", 2_100), /manual_review_required/);
  quarantine.requestManualReview("edge_a");
  assert.equal(quarantine.release("edge_a", "operator", 2_100).status, "RELEASED");
});

test("Rollback and emergency stop preserve timeline and evidence requirements", () => {
  const rollback = new RollbackEngine();
  assert.deepEqual(rollback.plan([], 10, "replay_divergence").status, "FAILED_CLOSED");
  const plan = rollback.plan([
    { checkpointSeq: 3, timestamp: 1_000, traceId: "trace_rb", reason: "checkpoint" },
    { checkpointSeq: 8, timestamp: 1_500, traceId: "trace_rb", reason: "checkpoint" }
  ], 10, "replay_divergence");
  assert.equal(plan.status, "ROLLBACK_READY");
  assert.equal(plan.targetCheckpointSeq, 8);
  assert.equal(plan.preserveTimelineContinuity, true);

  const stop = new EmergencyStop();
  assert.equal(stop.current().state, "ARMED");
  assert.throws(() => stop.trigger(3_000, "trace_stop", "kill_switch", []), /emergency_stop_requires_evidence/);
  assert.equal(stop.trigger(3_000, "trace_stop", "kill_switch", ["ev_reject_rate"]).state, "TRIGGERED");
});

test("Budget layer degrades cognition before execution integrity under pressure", () => {
  assert.deepEqual(new CpuBudget().evaluate({ evaluationMs: 6, executionThreadBlockedMs: 1 }), {
    status: "DEGRADED",
    reason: "governance_evaluation_budget_exceeded",
    degradeCognition: true
  });
  assert.deepEqual(new CpuBudget().evaluate({ evaluationMs: 1, executionThreadBlockedMs: 11 }).status, "SAFE_MODE");
  assert.equal(new MemoryBudget(100, 200).evaluate(201).status, "HALT");
  assert.equal(new NetworkBudget().evaluate({
    inboundMessagesPerSecond: 250,
    outboundRequestsPerSecond: 1,
    maxInboundMessagesPerSecond: 100,
    maxOutboundRequestsPerSecond: 10
  }).status, "SAFE_MODE");

  const rateLimit = new RateLimitEngine(2, 1_000);
  assert.equal(rateLimit.consume("orders", 1_000).allowed, true);
  assert.equal(rateLimit.consume("orders", 1_001).allowed, true);
  assert.equal(rateLimit.consume("orders", 1_002).allowed, false);
  assert.equal(rateLimit.consume("orders", 2_100).allowed, true);

  assert.equal(new BackpressureHandler().decide({ queueDepth: 75, queueCapacity: 100, executionCritical: true }).action, "THROTTLE_COGNITION");
  assert.equal(new BackpressureHandler().decide({ queueDepth: 95, queueCapacity: 100, executionCritical: false }).action, "REJECT_NON_CRITICAL");
});

test("ConstitutionalValidator fails closed on disputed operational reality", () => {
  const result = new ConstitutionalValidator().validate({
    timestamp: 4_000,
    traceId: "trace_const_1",
    subjectId: "BTCUSDT",
    disputedReality: true,
    evidenceMutationAttempted: false,
    replayIntegrityBypassed: false,
    quarantineOverrideWithoutHumanReview: false,
    survivabilityThresholdViolated: false,
    executionOutsideGovernanceAuthority: false,
    operationalMutationWithoutReconciliation: false,
    evidenceIds: ["ev_dispute"]
  });

  assert.equal(result.status, "FAILED_CLOSED");
  assert.equal(result.breaches[0]?.invariantId, "never_execute_on_disputed_reality");
  assert.equal(result.breaches[0]?.failClosed, true);
});

test("ConstitutionalValidator reports all simultaneous non-overridable breaches", () => {
  const result = new ConstitutionalValidator().validate({
    timestamp: 4_001,
    traceId: "trace_const_2",
    subjectId: "ETHUSDT",
    disputedReality: true,
    evidenceMutationAttempted: true,
    replayIntegrityBypassed: true,
    quarantineOverrideWithoutHumanReview: true,
    survivabilityThresholdViolated: true,
    executionOutsideGovernanceAuthority: true,
    operationalMutationWithoutReconciliation: true,
    evidenceIds: ["ev_const"]
  });

  assert.equal(result.status, "FAILED_CLOSED");
  assert.equal(result.breaches.length, 7);
});

test("Constitutional breaches require provenance and timeline evidence", () => {
  assert.throws(() => constitutionalBreach({
    breachId: "breach_no_evidence",
    invariantId: "never_bypass_replay_integrity",
    timestamp: 4_002,
    traceId: "trace_const_3",
    severity: "FATAL",
    reason: "replay_integrity_bypassed",
    evidence: []
  }), /constitutional_breach_requires_evidence/);
});

test("ConstitutionalAuditLog is append-only and evidence-bound", () => {
  const audit = new ConstitutionalAuditLog();
  audit.append({
    timestamp: 4_003,
    traceId: "trace_const_4",
    action: "validation_passed",
    subjectId: "runtime",
    evidenceIds: []
  });

  assert.equal(audit.all()[0]?.auditSeq, 1);
  assert.throws(() => audit.append({
    auditSeq: 3,
    timestamp: 4_004,
    traceId: "trace_const_4",
    action: "validation_failed",
    subjectId: "runtime",
    evidenceIds: ["ev_const"]
  }), /constitutional_audit_seq_not_append_only:3/);
});

test("AuthorityBoundaries deny execution outside runtime authority", () => {
  const boundaries = new AuthorityBoundaries();
  assert.equal(boundaries.can("runtime", "execute"), true);
  assert.equal(boundaries.can("governance", "execute"), false);
  assert.throws(() => boundaries.assert("edge", "execute"), /constitutional_authority_violation:edge:execute/);
});

test("Constitutional invariants and runtime rights expose survivability doctrine", () => {
  assert.equal(constitutionalInvariant("never_bypass_replay_integrity").nonOverridable, true);
  assert.equal(NON_OVERRIDABLE_RULES.has("never_mutate_append_only_evidence"), true);
  assert.equal(RUNTIME_RIGHTS.includes("right_to_fail_closed"), true);
});

test("InvariantChecker rejects failed invariant without evidence", () => {
  assert.throws(() => new InvariantChecker().check("trace_verify_1", [
    { id: "no_replay_divergence", passed: false, evidenceIds: [], reason: "diverged" }
  ]), /failed_invariant_requires_evidence:no_replay_divergence/);
});

test("InvariantChecker produces deterministic proof report", () => {
  const report = new InvariantChecker().check("trace_verify_2", [
    { id: "no_temporal_paradox", passed: true, evidenceIds: [], reason: "ok" }
  ]);

  assert.equal(report.status, "PROVEN");
  assert.equal(report.traceId, "trace_verify_2");
});

test("StateMachineVerifier detects impossible transitions with evidence", () => {
  const verifier = new StateMachineVerifier([
    { from: "NORMAL", to: "SAFE_MODE" },
    { from: "SAFE_MODE", to: "HALTED" }
  ] as const);

  assert.equal(verifier.verify("NORMAL", "SAFE_MODE", "trace_verify_3", []).legal, true);
  assert.equal(verifier.verify("SAFE_MODE", "NORMAL", "trace_verify_3", ["ev_transition"]).legal, false);
});

test("ReplayConsistencyVerifier detects replay divergence deterministically", () => {
  const report = new ReplayConsistencyVerifier().verify(
    [{ seq: 1, digest: "a" }, { seq: 2, digest: "b" }],
    [{ seq: 1, digest: "a" }, { seq: 2, digest: "c" }],
    "trace_replay_verify"
  );

  assert.equal(report.status, "DIVERGENT");
  assert.equal(report.divergenceSeq, 2);
});

test("TransitionSafetyVerifier requires authorization rollback and replay safety", () => {
  const report = new TransitionSafetyVerifier().verify({
    from: "NORMAL",
    to: "DEGRADED",
    governanceAuthorized: false,
    rollbackSafe: true,
    replayConsistent: false,
    traceId: "trace_transition_safety",
    evidenceIds: ["ev_governance", "ev_replay"]
  });

  assert.equal(report.status, "UNSAFE");
  assert.deepEqual(report.reasons, ["governance_bypass", "replay_divergence"]);
});

test("CausalityValidator detects temporal paradoxes and missing causes", () => {
  const validator = new CausalityValidator();
  assert.equal(validator.validate([
    { id: "a", timestamp: 10 },
    { id: "b", timestamp: 9 }
  ], "trace_causality").reason, "temporal_paradox");
  assert.equal(validator.validate([
    { id: "effect", timestamp: 10, causationId: "missing" }
  ], "trace_causality").reason, "missing_cause");
});

test("GovernanceProofBuilder rejects untraceable failed proofs", () => {
  const proof = new GovernanceProofBuilder().prove({
    traceId: "trace_proof",
    policyId: "policy_safe",
    authorized: true,
    constraintsSatisfied: true,
    evidenceIds: []
  });

  assert.equal(proof.status, "PROVEN");
  assert.throws(() => new GovernanceProofBuilder().prove({
    traceId: "trace_proof",
    policyId: "policy_safe",
    authorized: false,
    constraintsSatisfied: true,
    evidenceIds: []
  }), /rejected_governance_proof_requires_evidence/);
});

test("CapabilityRegistry grants explicit least-authority permissions only", () => {
  const registry = new CapabilityRegistry();
  registry.grant({ capabilityId: "cap_runtime_execute", layer: "runtime", permission: "execute", traceId: "trace_cap" });

  assert.equal(registry.require("cap_runtime_execute", "execute").explicit, true);
  assert.throws(() => registry.grant({ capabilityId: "cap_bad", layer: "edge", permission: "execute", traceId: "trace_cap" }), /capability_permission_denied/);
});

test("IsolationBoundaries prevent cross-boundary mutation", () => {
  const boundaries = new IsolationBoundaries();

  assert.equal(boundaries.check("edge", "governance", false).allowed, true);
  assert.equal(boundaries.check("edge", "runtime", true).allowed, false);
});

test("ExecutionScopeValidator denies unauthorized symbols", () => {
  const scope = {
    scopeId: "scope_1",
    capabilityId: "cap_runtime_execute",
    traceId: "trace_scope",
    sandboxed: false,
    allowedSymbols: ["BTCUSDT"]
  };

  new ExecutionScopeValidator().validate(scope, "BTCUSDT");
  assert.throws(() => new ExecutionScopeValidator().validate(scope, "ETHUSDT"), /execution_scope_symbol_denied:ETHUSDT/);
});

test("MutationAuthorityValidator requires reconciliation and provenance", () => {
  const validator = new MutationAuthorityValidator();
  validator.assert({
    authorityId: "mut_1",
    capabilityId: "cap_runtime_execute",
    traceId: "trace_mut",
    reconciled: true,
    provenanceIds: ["ev_reconciled"]
  });
  assert.throws(() => validator.assert({
    authorityId: "mut_2",
    capabilityId: "cap_runtime_execute",
    traceId: "trace_mut",
    reconciled: false,
    provenanceIds: ["ev_reconciled"]
  }), /mutation_requires_reconciliation/);
});

test("SandboxPolicy keeps simulation sandbox-only", () => {
  const policy = new SandboxPolicy();

  assert.equal(policy.evaluate({ layer: "simulation", requestedMutation: false, sandboxed: true }).allowed, true);
  assert.equal(policy.evaluate({ layer: "simulation", requestedMutation: false, sandboxed: false }).allowed, false);
  assert.equal(policy.evaluate({ layer: "runtime", requestedMutation: true, sandboxed: true }).allowed, false);
});

test("CausalOrderValidator detects reordered events and future causes", () => {
  const issues = new CausalOrderValidator().validate([
    { id: "a", seq: 2, timestamp: 20 },
    { id: "b", seq: 1, timestamp: 19, causationSeq: 3 }
  ]);

  assert.deepEqual(issues.map((issue) => issue.reason), ["out_of_order_sequence", "time_reversal", "future_cause"]);
});

test("MonotonicClock rejects clock regression", () => {
  const clock = new MonotonicClock(10);
  assert.equal(clock.advance(11), 11);
  assert.throws(() => clock.advance(10), /monotonic_clock_regression:10<11/);
});

test("TemporalValidator rejects future-state execution and replay drift", () => {
  const result = new TemporalValidator().validate({
    decisionTimestamp: 20,
    latestKnownTimestamp: 19,
    replayDrift: 1,
    traceId: "trace_temporal"
  });

  assert.equal(result.status, "REJECTED");
  assert.deepEqual(result.reasons, ["future_state_execution", "replay_drift"]);
});

test("ReplayDriftDetector requires zero drift", () => {
  assert.equal(new ReplayDriftDetector().detect(10, 10).status, "ZERO_DRIFT");
  assert.equal(new ReplayDriftDetector().detect(10, 12).status, "DRIFT_DETECTED");
});

test("TimelineLock prevents concurrent timeline mutation", () => {
  const lock = new TimelineLock();
  lock.acquire({ lockId: "lock_1", traceId: "trace_lock", lockedAtSeq: 10, reason: "rollback" });

  assert.equal(lock.current()?.lockId, "lock_1");
  assert.throws(() => lock.acquire({ lockId: "lock_2", traceId: "trace_lock", lockedAtSeq: 11, reason: "replay" }), /timeline_already_locked:lock_1/);
  lock.release("lock_1");
  assert.equal(lock.current(), undefined);
});

test("CausalityWindow rejects delayed causality and future contamination", () => {
  const window = new CausalityWindow(100);

  assert.equal(window.evaluate(1_000, 1_050).accepted, true);
  assert.equal(window.evaluate(1_000, 1_200).reason, "delayed_causality");
  assert.equal(window.evaluate(1_000, 900).reason, "future_state_contamination");
});

test("ManualApprovalWorkflow requires operator provenance", () => {
  const approval = new ManualApprovalWorkflow().approve({
    actionId: "approval_1",
    operatorId: "operator",
    timestamp: 5_000,
    traceId: "trace_oversight",
    reason: "release reviewed",
    provenanceIds: ["ev_review"],
    approvedSubjectId: "edge_a"
  });

  assert.equal(approval.type, "approve");
  assert.throws(() => new ManualApprovalWorkflow().approve({
    actionId: "approval_2",
    operatorId: "operator",
    timestamp: 5_001,
    traceId: "trace_oversight",
    reason: "missing evidence",
    provenanceIds: [],
    approvedSubjectId: "edge_a"
  }), /operator_action_requires_provenance/);
});

test("GovernanceOverrideWorkflow creates replayable override records", () => {
  const override = new GovernanceOverrideWorkflow().override({
    actionId: "override_1",
    operatorId: "operator",
    timestamp: 5_002,
    traceId: "trace_override",
    reason: "manual safe recovery",
    provenanceIds: ["ev_override"],
    fromState: "SAFE_MODE",
    toState: "DEGRADED",
    policyId: "manual_override"
  });

  assert.equal(override.type, "override");
  assert.equal(override.policyId, "manual_override");
});

test("EmergencyInterventionWorkflow stops mutation with provenance", () => {
  const intervention = new EmergencyInterventionWorkflow().intervene({
    actionId: "emergency_1",
    operatorId: "operator",
    timestamp: 5_003,
    traceId: "trace_emergency",
    reason: "unknown replay divergence",
    provenanceIds: ["ev_divergence"]
  });

  assert.equal(intervention.stopMutation, true);
});

test("RuntimeInspection returns replay-consistent evidence view", () => {
  const view = new RuntimeInspection().inspect({
    traceId: "trace_inspect",
    subjectId: "BTCUSDT",
    evidenceIds: ["ev_reality"],
    runtimeState: { mode: "SAFE_MODE" }
  });

  assert.equal(view.replayConsistent, true);
  assert.equal(view.runtimeState.mode, "SAFE_MODE");
});

test("ExplainabilityViewBuilder requires evidence and confidence explanation", () => {
  const view = new ExplainabilityViewBuilder().build({
    traceId: "trace_explain",
    subjectId: "edge_a",
    policyId: "trust_policy",
    decision: "quarantine",
    reason: "trust_score_below_threshold",
    evidenceIds: ["ev_gap"],
    confidenceExplanation: ["sequence_gap_count=3"]
  });

  assert.equal(view.replayConsistent, true);
  assert.throws(() => new ExplainabilityViewBuilder().build({
    traceId: "trace_explain",
    subjectId: "edge_a",
    policyId: "trust_policy",
    decision: "quarantine",
    reason: "trust_score_below_threshold",
    evidenceIds: ["ev_gap"],
    confidenceExplanation: []
  }), /explainability_requires_confidence_explanation/);
});

test("Constitution verification capability temporal and oversight compose into survivability decision", () => {
  const constitution = new ConstitutionalValidator().validate({
    timestamp: 6_000,
    traceId: "trace_compose",
    subjectId: "runtime",
    disputedReality: false,
    evidenceMutationAttempted: false,
    replayIntegrityBypassed: false,
    quarantineOverrideWithoutHumanReview: false,
    survivabilityThresholdViolated: false,
    executionOutsideGovernanceAuthority: false,
    operationalMutationWithoutReconciliation: false,
    evidenceIds: ["ev_compose"]
  });
  const proof = new GovernanceProofBuilder().prove({
    traceId: "trace_compose",
    policyId: "policy_execute",
    authorized: true,
    constraintsSatisfied: true,
    evidenceIds: ["ev_compose"]
  });
  const temporal = new TemporalValidator().validate({
    decisionTimestamp: 6_000,
    latestKnownTimestamp: 6_000,
    replayDrift: 0,
    traceId: "trace_compose"
  });
  const capability = new CapabilityRegistry().grant({
    capabilityId: "cap_compose",
    layer: "runtime",
    permission: "execute",
    traceId: "trace_compose"
  });
  const view = new ExplainabilityViewBuilder().build({
    traceId: "trace_compose",
    subjectId: "runtime",
    policyId: proof.policyId,
    decision: "execute_allowed",
    reason: "constitution_governance_temporal_capability_satisfied",
    evidenceIds: ["ev_compose"],
    confidenceExplanation: ["all_deterministic_checks_passed"]
  });

  assert.equal(constitution.status, "PASSED");
  assert.equal(proof.status, "PROVEN");
  assert.equal(temporal.status, "VALID");
  assert.equal(capability.permission, "execute");
  assert.equal(view.replayConsistent, true);
});

test("identityFingerprint is deterministic for reordered object keys", () => {
  assert.equal(
    identityFingerprint({ b: 2, a: 1 }),
    identityFingerprint({ a: 1, b: 2 })
  );
});

test("doctrineVersion validates operational doctrine identity", () => {
  assert.equal(doctrineVersion({ versionId: "V55", effectiveFrom: 1, description: "adversarial simulation" }).versionId, "V55");
  assert.throws(() => doctrineVersion({ versionId: "", effectiveFrom: 1, description: "bad" }), /doctrine_version_id_required/);
});

test("PolicyLineage is append-only evidence-bound and fingerprinted", () => {
  const lineage = new PolicyLineage();
  lineage.append({ policyId: "policy_a", version: "1", activatedAt: 10, traceId: "trace_policy", evidenceIds: ["ev_policy"] });

  assert.equal(lineage.all().length, 1);
  assert.equal(lineage.fingerprint().length, 64);
  assert.throws(() => lineage.append({ policyId: "policy_b", version: "1", activatedAt: 9, traceId: "trace_policy", evidenceIds: ["ev_policy"] }), /policy_lineage_time_regression/);
});

test("GovernanceLineage preserves replayable governance continuity", () => {
  const lineage = new GovernanceLineage();
  lineage.append({ governanceId: "gov_1", state: "NORMAL", decidedAt: 10, traceId: "trace_gov", evidenceIds: ["ev_gov"] });
  lineage.append({ governanceId: "gov_2", state: "SAFE_MODE", decidedAt: 11, traceId: "trace_gov", evidenceIds: ["ev_gov_2"] });

  assert.equal(lineage.all()[1]?.state, "SAFE_MODE");
  assert.equal(lineage.fingerprint(), lineage.fingerprint());
});

test("invariantFingerprint is order-insensitive and doctrine-bound", () => {
  const first = invariantFingerprint({ doctrineVersionId: "V55", invariantIds: ["b", "a"] });
  const second = invariantFingerprint({ doctrineVersionId: "V55", invariantIds: ["a", "b"] });

  assert.equal(first, second);
  assert.throws(() => invariantFingerprint({ doctrineVersionId: "V55", invariantIds: [] }), /invariant_fingerprint_requires_invariants/);
});

test("continuityHash requires all identity fields", () => {
  assert.equal(continuityHash({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  }).length, 64);
  assert.throws(() => continuityHash({
    runtimeId: "",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  }), /continuity_hash_field_required:runtimeId/);
});

test("runtimeIdentity detects changed continuity against previous identity", () => {
  const stable = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  });
  const drifted = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov_changed",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55",
    previousContinuityHash: stable.continuityHash
  });

  assert.equal(stable.identityDriftScore, 0);
  assert.equal(drifted.identityDriftScore, 1);
});

test("MutationHistory is append-only and requires provenance", () => {
  const history = new MutationHistory();
  history.append({ timestamp: 1, traceId: "trace_mutation", mutationType: "doctrine_transition", reason: "upgrade", provenanceIds: ["ev_doc"] });

  assert.equal(history.all()[0]?.mutationSeq, 1);
  assert.throws(() => history.append({ timestamp: 2, traceId: "trace_mutation", mutationType: "policy_activation", reason: "bad", provenanceIds: [] }), /identity_mutation_requires_provenance/);
});

test("IdentityDriftDetector explains doctrine and lineage divergence", () => {
  const expected = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V54"
  });
  const actual = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov2",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  });
  const report = new IdentityDriftDetector().detect(expected, actual, "trace_drift", ["ev_drift"]);

  assert.equal(report.status, "DRIFT_DETECTED");
  assert.equal(report.reasons.includes("governance_lineage_changed"), true);
  assert.equal(report.reasons.includes("doctrine_version_changed"), true);
});

test("IdentityCoherenceCheck validates identity score coherence", () => {
  const identity = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  });

  assert.equal(new IdentityCoherenceCheck().check(identity).status, "COHERENT");
});

test("IdentityAttestor rejects drifted identity and requires evidence", () => {
  const identity = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55",
    previousContinuityHash: "different"
  });

  assert.equal(new IdentityAttestor().attest({ attestationId: "attest_1", timestamp: 1, traceId: "trace_attest", runtimeIdentity: identity, evidenceIds: ["ev_identity"] }).status, "REJECTED");
  assert.throws(() => new IdentityAttestor().attest({ attestationId: "attest_2", timestamp: 1, traceId: "trace_attest", runtimeIdentity: identity, evidenceIds: [] }), /identity_attestation_requires_evidence/);
});

test("EvidenceChainBuilder produces deterministic ordered evidence chain", () => {
  const chain = new EvidenceChainBuilder().build("chain_1", "trace_chain", [
    { evidenceId: "b", timestamp: 2, source: "runtime", summary: "second" },
    { evidenceId: "a", timestamp: 1, source: "edge", summary: "first" }
  ]);

  assert.deepEqual(chain.steps.map((step) => step.evidenceId), ["a", "b"]);
});

test("CausalExplainer renders provenance-linked causal explanation", () => {
  const chain = new EvidenceChainBuilder().build("chain_2", "trace_causal", [
    { evidenceId: "ev_1", timestamp: 1, source: "edge", summary: "gap" }
  ]);
  const explanation = new CausalExplainer().explain({
    explanationId: "explain_1",
    traceId: "trace_causal",
    decision: "quarantine",
    cause: "sequence gap",
    effect: "source quarantined",
    evidenceChain: chain
  });

  assert.equal(explanation.humanReadable.includes("sequence gap caused source quarantined"), true);
});

test("GovernanceReasoningBuilder explains rejected governance decisions", () => {
  const reasoning = new GovernanceReasoningBuilder().build({
    traceId: "trace_gov_reason",
    policyId: "policy_safe",
    action: "execute",
    accepted: false,
    reasons: ["disputed_reality"],
    evidenceIds: ["ev_dispute"]
  });

  assert.equal(reasoning.outcome, "REJECTED");
  assert.equal(reasoning.humanReadable.includes("disputed_reality"), true);
});

test("ConfidenceExplainer exposes effective confidence and evidence lineage", () => {
  const explanation = new ConfidenceExplainer().explain({
    traceId: "trace_confidence",
    confidence: 0.8,
    degradationWeight: 0.25,
    evidenceIds: ["ev_confidence"],
    factors: ["stale_feed"]
  });

  assert.equal(explanation.effectiveConfidence, 0.6000000000000001);
  assert.equal(explanation.humanReadable.includes("0.6000"), true);
});

test("TransitionExplainer explains unsafe operational transitions", () => {
  const explanation = new TransitionExplainer().explain({
    traceId: "trace_transition_explain",
    from: "SAFE_MODE",
    to: "NORMAL",
    safe: false,
    reasons: ["manual_review_missing"],
    evidenceIds: ["ev_review"]
  });

  assert.equal(explanation.humanReadable.includes("unsafe"), true);
});

test("SemanticTimeline is append-only and evidence-bound", () => {
  const timeline = new SemanticTimeline();
  timeline.append({ timestamp: 1, traceId: "trace_semantic", subjectId: "runtime", summary: "entered safe mode", evidenceIds: ["ev_safe"] });

  assert.equal(timeline.all()[0]?.semanticSeq, 1);
  assert.throws(() => timeline.append({ semanticSeq: 3, timestamp: 2, traceId: "trace_semantic", subjectId: "runtime", summary: "bad", evidenceIds: ["ev_bad"] }), /semantic_timeline_seq_not_append_only:3/);
});

test("RuntimeJustificationBuilder composes governance causality and confidence reasons", () => {
  const justification = new RuntimeJustificationBuilder().build({
    traceId: "trace_justify",
    decision: "reject_execution",
    governanceReason: "constitutional breach",
    causalReason: "disputed evidence",
    confidenceReason: "effective confidence below threshold",
    evidenceIds: ["ev_justify"]
  });

  assert.equal(justification.humanReadable.includes("Decision: reject_execution"), true);
});

test("AdversarialRuntime contains fake reality attempts", () => {
  const scenario = fakeRealityScenario(1, "trace_sim");
  assert.equal(new AdversarialRuntime().run(scenario, "REJECT").contained, true);
});

test("AdversarialRuntime detects containment mismatch", () => {
  const scenario = forgedProvenanceScenario(1, "trace_sim");
  const result = new AdversarialRuntime().run(scenario, "SAFE_MODE");

  assert.equal(result.contained, false);
  assert.equal(result.reason, "containment_mismatch");
});

test("Adversarial simulation domains define expected containment actions", () => {
  const scenarios = [
    temporalCorruptionScenario(1, "trace_sim"),
    replayDivergenceScenario(1, "trace_sim"),
    governancePoisoningScenario(1, "trace_sim"),
    capabilityEscalationScenario(1, "trace_sim"),
    delayedTruthInjectionScenario(1, "trace_sim"),
    staleValidObservationScenario(1, "trace_sim"),
    confidenceSpoofingScenario(1, "trace_sim"),
    identityDriftAttackScenario(1, "trace_sim"),
    quarantineBypassScenario(1, "trace_sim"),
    timelineDesynchronizationScenario(1, "trace_sim")
  ];

  assert.deepEqual(scenarios.map((scenario) => scenario.expectedContainment), [
    "HALT",
    "HALT",
    "SAFE_MODE",
    "REJECT",
    "QUARANTINE",
    "SAFE_MODE",
    "REJECT",
    "HALT",
    "REJECT",
    "HALT"
  ]);
});

test("AdversarialRuntime requires evidence for corruption scenarios", () => {
  assert.throws(() => new AdversarialRuntime().run({
    scenarioId: "bad",
    domain: "fake_reality",
    timestamp: 1,
    traceId: "trace_sim",
    evidenceIds: [],
    expectedContainment: "REJECT"
  }, "REJECT"), /adversarial_scenario_requires_evidence/);
});

test("identity drift attack composes with identity detector", () => {
  const scenario = identityDriftAttackScenario(1, "trace_identity_attack");
  const expected = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  });
  const actual = runtimeIdentity({
    runtimeId: "runtime",
    genesisHash: "genesis_changed",
    governanceLineageHash: "gov",
    policyLineageHash: "policy",
    invariantFingerprint: "invariant",
    doctrineVersionId: "V55"
  });

  assert.equal(new IdentityDriftDetector().detect(expected, actual, scenario.traceId, scenario.evidenceIds).status, "DRIFT_DETECTED");
});

test("adaptationPressure detects excessive doctrine and policy change", () => {
  const signal = adaptationPressure(3, 2, 10, ["ev_adapt"]);
  assert.equal(signal.name, "adaptationPressure");
  assert.equal(signal.level, "HIGH");
});

test("epistemicStress detects disputed reality pressure", () => {
  assert.equal(epistemicStress(4, 3, 10, ["ev_epi"]).level, "HIGH");
});

test("governanceSaturation escalates overloaded governance", () => {
  assert.equal(governanceSaturation(6, 2, 10, ["ev_gov_sat"]).level, "CRITICAL");
});

test("contradictionDensity quantifies contradiction accumulation", () => {
  assert.equal(contradictionDensity(5, 10, ["ev_contra"]).score, 0.5);
});

test("trustFracture tracks fragmented source trust", () => {
  assert.equal(trustFracture(2, 2, 4, ["ev_trust"]).level, "HIGH");
});

test("identityInstability incorporates identity drift and lineage changes", () => {
  assert.equal(identityInstability(0.6, 2, ["ev_identity_pressure"]).level, "HIGH");
});

test("operationalFatigue detects oversight overload", () => {
  assert.equal(operationalFatigue(4, 2, 10, ["ev_fatigue"]).level, "CRITICAL");
});

test("uncertaintyPressure tracks unknown and low-confidence growth", () => {
  assert.equal(uncertaintyPressure(2, 3, 10, ["ev_uncertainty"]).score, 0.5);
});

test("coherenceDecay detects declining operational coherence", () => {
  assert.equal(coherenceDecay(0.9, 0.3, ["ev_decay"]).level, "ELEVATED");
});

test("SurvivabilityIndexEvaluator recommends degradation from systemic pressure", () => {
  const index = new SurvivabilityIndexEvaluator().evaluate({
    adaptationPressure: adaptationPressure(3, 1, 10, ["ev_1"]),
    epistemicStress: epistemicStress(2, 2, 10, ["ev_2"]),
    governanceSaturation: governanceSaturation(5, 1, 10, ["ev_3"]),
    contradictionDensity: contradictionDensity(4, 10, ["ev_4"]),
    trustFracture: trustFracture(1, 2, 5, ["ev_5"]),
    identityInstability: identityInstability(0.2, 1, ["ev_6"]),
    operationalFatigue: operationalFatigue(3, 1, 10, ["ev_7"]),
    uncertaintyPressure: uncertaintyPressure(2, 2, 10, ["ev_8"]),
    coherenceDecay: coherenceDecay(0.9, 0.5, ["ev_9"])
  });
  assert.equal(index.recommendation, "THROTTLE_COGNITION");
  assert.equal(index.evidenceIds.length, 9);
});

test("pressure signals require evidence and explanation", () => {
  assert.throws(() => adaptationPressure(1, 1, 10, []), /pressure_requires_evidence_and_explanation/);
});

test("complexityBudget flags policy conflict density", () => {
  assert.equal(complexityBudget(2, 2, 10, ["ev_complexity"]).status, "WITHIN_BUDGET");
  assert.equal(complexityBudget(4, 3, 10, ["ev_complexity"]).status, "COLLAPSE_RISK");
});

test("causalDepthBudget protects finite causal depth", () => {
  assert.equal(causalDepthBudget(8, 10, ["ev_depth"]).status, "DEGRADED");
});

test("contradictionBudget detects bounded contradiction breach", () => {
  assert.equal(contradictionBudget(10, 10, ["ev_contra_budget"]).status, "COLLAPSE_RISK");
});

test("governanceLoadBudget detects governance overload", () => {
  assert.equal(governanceLoadBudget(7, 10, ["ev_gov_load"]).status, "DEGRADED");
});

test("explainabilityBudget bounds explanation recursion", () => {
  assert.equal(explainabilityBudget(9, 10, ["ev_explain_budget"]).status, "COLLAPSE_RISK");
});

test("semanticDensity keeps semantic expansion compressible", () => {
  assert.equal(semanticDensity(3, 10, ["ev_semantic_density"]).status, "WITHIN_BUDGET");
});

test("oversightPressure detects approval saturation", () => {
  assert.equal(oversightPressure(9, 10, ["ev_oversight"]).status, "COLLAPSE_RISK");
});

test("RecursionDetector detects governance recursion", () => {
  assert.deepEqual(new RecursionDetector().detect(["a", "b", "a"]), { status: "RECURSION_DETECTED", repeatedNode: "a" });
});

test("InstabilityThreshold reports worst complexity score", () => {
  const report = new InstabilityThreshold().evaluate([
    causalDepthBudget(2, 10, ["ev_a"]),
    contradictionBudget(9, 10, ["ev_b"])
  ]);
  assert.equal(report.status, "UNSTABLE");
  assert.equal(report.worstScore, 0.9);
});

test("ComplexityCollapseDetector degrades cognition before collapse", () => {
  const report = new ComplexityCollapseDetector().detect([
    governanceLoadBudget(7, 10, ["ev_load"])
  ]);
  assert.equal(report.action, "THROTTLE_COGNITION");
});

test("ComplexityCollapseDetector enters safe mode on collapse risk", () => {
  const report = new ComplexityCollapseDetector().detect([
    contradictionBudget(10, 10, ["ev_collapse"])
  ]);
  assert.equal(report.status, "COLLAPSE_IMMINENT");
  assert.equal(report.action, "SAFE_MODE");
});

test("GovernanceAudit is append-only and evidence-bound", () => {
  const audit = new GovernanceAudit();
  audit.append({ timestamp: 1, traceId: "trace_meta", policyId: "policy", action: "authorize", evidenceIds: ["ev_meta"] });
  assert.equal(audit.all()[0]?.auditSeq, 1);
  assert.throws(() => audit.append({ auditSeq: 3, timestamp: 2, traceId: "trace_meta", policyId: "policy", action: "bad", evidenceIds: ["ev_meta"] }), /governance_audit_seq_not_append_only:3/);
});

test("DoctrineConsistency detects missing constitutional invariants", () => {
  const report = new DoctrineConsistency().evaluate(["a", "b"], ["a"], ["ev_doctrine"]);
  assert.equal(report.status, "INCONSISTENT");
  assert.deepEqual(report.conflicts, ["b"]);
});

test("policyStability detects unstable policy churn", () => {
  assert.equal(policyStability(6, 10, ["ev_policy_stability"]).status, "UNSTABLE");
});

test("overrideAnalysis detects override abuse risk", () => {
  assert.equal(overrideAnalysis(3, 10, ["ev_override"]).status, "ABUSE_RISK");
});

test("governanceDrift detects missing expected policies", () => {
  assert.equal(governanceDrift(["a", "b"], ["a"], ["ev_drift"]).status, "DRIFTING");
});

test("constitutionalPressure can invalidate governance legitimacy", () => {
  assert.equal(constitutionalPressure(5, 10, ["ev_const_pressure"]).status, "CRITICAL");
});

test("LegitimacyEvaluator rejects inconsistent governance", () => {
  const report = new LegitimacyEvaluator().evaluate({
    doctrine: new DoctrineConsistency().evaluate(["a"], [], ["ev_doctrine"]),
    stability: policyStability(1, 10, ["ev_policy"]),
    overrides: overrideAnalysis(0, 10, ["ev_override"]),
    drift: governanceDrift(["a"], ["a"], ["ev_drift"]),
    constitutionalPressure: constitutionalPressure(0, 10, ["ev_const"])
  });
  assert.equal(report.status, "ILLEGITIMATE");
});

test("LegitimacyEvaluator degrades governance on override abuse", () => {
  const report = new LegitimacyEvaluator().evaluate({
    doctrine: new DoctrineConsistency().evaluate(["a"], ["a"], ["ev_doctrine"]),
    stability: policyStability(1, 10, ["ev_policy"]),
    overrides: overrideAnalysis(3, 10, ["ev_override"]),
    drift: governanceDrift(["a"], ["a"], ["ev_drift"]),
    constitutionalPressure: constitutionalPressure(0, 10, ["ev_const"])
  });
  assert.equal(report.status, "DEGRADED");
});

test("SemanticCompressor preserves evidence lineage and deterministic summary", () => {
  const compressed = new SemanticCompressor().compress({
    traceId: "trace_compress",
    subjectId: "runtime",
    statements: ["b", "a", "a"],
    evidenceIds: ["ev_semantic"]
  });
  assert.equal(compressed.summary, "a | b");
  assert.equal(compressed.replaySafe, true);
});

test("causalSummarizer preserves ordered causal meaning", () => {
  assert.equal(causalSummarizer(["b", "a"], ["ev_causal"]).summary, "a -> b");
});

test("evidenceCompaction deduplicates evidence deterministically", () => {
  assert.deepEqual(evidenceCompaction(["b", "a", "b"]).compactedEvidenceIds, ["a", "b"]);
});

test("timelineAbstraction preserves replay-safe bounds", () => {
  assert.deepEqual(timelineAbstraction([3, 1, 2], ["ev_time"]), { start: 1, end: 3, eventCount: 3, evidenceIds: ["ev_time"] });
});

test("governanceSummary compresses policies and outcomes", () => {
  assert.equal(governanceSummary(["b", "a"], ["reject", "accept"], ["ev_gov_summary"]).summary, "a,b:accept,reject");
});

test("contradictionClustering groups contradictions by subject", () => {
  const clusters = contradictionClustering([
    { subjectId: "ETH", contradictionId: "c2" },
    { subjectId: "BTC", contradictionId: "c1" }
  ]);
  assert.deepEqual(clusters.map((cluster) => cluster.subjectId), ["BTC", "ETH"]);
});

test("replayCompression preserves deterministic replay digest", () => {
  assert.deepEqual(replayCompression([3, 1, 2], "digest"), { firstSeq: 1, lastSeq: 3, count: 3, digest: "digest", replaySafe: true });
});

test("semantic compression rejects lineage-free summaries", () => {
  assert.throws(() => new SemanticCompressor().compress({ traceId: "trace", subjectId: "runtime", statements: ["a"], evidenceIds: [] }), /semantic_compression_requires_content/);
});

test("systemic incoherence composes pressure complexity and meta-governance", () => {
  const pressure = new SurvivabilityIndexEvaluator().evaluate({
    adaptationPressure: adaptationPressure(5, 2, 10, ["ev_1"]),
    epistemicStress: epistemicStress(5, 4, 10, ["ev_2"]),
    governanceSaturation: governanceSaturation(8, 2, 10, ["ev_3"]),
    contradictionDensity: contradictionDensity(8, 10, ["ev_4"]),
    trustFracture: trustFracture(3, 2, 5, ["ev_5"]),
    identityInstability: identityInstability(0.9, 2, ["ev_6"]),
    operationalFatigue: operationalFatigue(7, 2, 10, ["ev_7"]),
    uncertaintyPressure: uncertaintyPressure(5, 4, 10, ["ev_8"]),
    coherenceDecay: coherenceDecay(1, 0.05, ["ev_9"])
  });
  const collapse = new ComplexityCollapseDetector().detect([contradictionBudget(10, 10, ["ev_complex"])]);
  const legitimacy = new LegitimacyEvaluator().evaluate({
    doctrine: new DoctrineConsistency().evaluate(["a"], [], ["ev_doctrine"]),
    stability: policyStability(7, 10, ["ev_policy"]),
    overrides: overrideAnalysis(3, 10, ["ev_override"]),
    drift: governanceDrift(["a"], [], ["ev_drift"]),
    constitutionalPressure: constitutionalPressure(6, 10, ["ev_const"])
  });
  assert.equal(pressure.recommendation, "HALT");
  assert.equal(collapse.action, "SAFE_MODE");
  assert.equal(legitimacy.status, "ILLEGITIMATE");
});

test("cognitiveLoad bounds disputes contradictions and trust fractures", () => {
  const decision = cognitiveLoad({
    activeDisputes: 2,
    unresolvedContradictions: 2,
    trustFractures: 2,
    maxCognitiveLoad: 10,
    evidenceIds: ["ev_cognitive_load"]
  });
  assert.equal(decision.status, "DEGRADED");
});

test("governanceLoad weights overrides above normal governance actions", () => {
  const decision = governanceLoad({
    activeGovernanceActions: 3,
    activeOverrides: 2,
    maxGovernanceLoad: 10,
    evidenceIds: ["ev_governance_load"]
  });
  assert.equal(decision.score, 0.7);
});

test("causalDepth wrapper preserves causal depth budget semantics", () => {
  assert.equal(causalDepth({ currentDepth: 10, maxDepth: 10, evidenceIds: ["ev_causal_depth"] }).status, "COLLAPSE_RISK");
});

test("unresolvedPressure detects unresolved systemic conflict pressure", () => {
  const decision = unresolvedPressure({
    unresolvedContradictions: 2,
    unresolvedGovernanceConflicts: 2,
    unresolvedCausalConflicts: 1,
    maxUnresolvedPressure: 10,
    evidenceIds: ["ev_unresolved"]
  });
  assert.equal(decision.status, "DEGRADED");
});

test("RecursionGuard contains recursive governance paths", () => {
  assert.deepEqual(new RecursionGuard().evaluate(["govern", "audit", "govern"]), {
    status: "RECURSION_DETECTED",
    repeatedNode: "govern",
    action: "CONTAIN"
  });
});

test("ComplexitySemanticCompression preserves causality before compression", () => {
  const compressed = new ComplexitySemanticCompression().compress({
    traceId: "trace_complexity_compress",
    semanticItems: ["z", "a", "z"],
    evidenceIds: ["ev_complexity_compress"],
    preserveCausality: true
  });
  assert.equal(compressed.status, "COMPRESSED");
  assert.equal(compressed.summary, "a | z");
  assert.equal(compressed.replaySafe, true);
});

test("ComplexitySemanticCompression rejects lossy causal compression", () => {
  const compressed = new ComplexitySemanticCompression().compress({
    traceId: "trace_complexity_compress",
    semanticItems: ["cause", "effect"],
    evidenceIds: ["ev_complexity_compress"],
    preserveCausality: false
  });
  assert.equal(compressed.status, "REJECTED");
  assert.equal(compressed.replaySafe, false);
});

test("StabilizationEngine preserves constitutional continuity and replayability", () => {
  const report = new StabilizationEngine().stabilize([
    cognitiveLoad({
      activeDisputes: 1,
      unresolvedContradictions: 1,
      trustFractures: 1,
      maxCognitiveLoad: 10,
      evidenceIds: ["ev_stabilize"]
    })
  ]);
  assert.equal(report.preserveConstitutionalContinuity, true);
  assert.equal(report.preserveReplayability, true);
  assert.equal(report.action, "CONTINUE");
});

test("realityFracture detects divergence between reality layers", () => {
  const report = realityFracture("obs_a", "inf_a", "trusted_b", "op_b", ["ev_reality_fracture"]);
  assert.equal(report.status, "FRACTURED");
  assert.equal(report.fractureScore > 0, true);
});

test("epistemicContamination detects forged delayed stale evidence", () => {
  assert.equal(epistemicContamination(true, true, false, ["ev_contam"]).status, "CONTAMINATED");
});

test("confidenceCollapse is traceable and thresholded", () => {
  assert.equal(confidenceCollapse(0.9, 0.2, ["ev_conf_collapse"]).status, "COLLAPSED");
});

test("semanticDriftDetector exposes missing semantic continuity", () => {
  const report = semanticDriftDetector(["governance", "replay"], ["governance"], ["ev_sem_drift"]);
  assert.equal(report.status, "DRIFTING");
  assert.deepEqual(report.missing, ["replay"]);
});

test("OperationalRealityLock freezes and releases operational reality", () => {
  const lock = new OperationalRealityLock();
  lock.freeze({ lockId: "lock_reality", traceId: "trace_reality", lockedAt: 1, reason: "fragmentation", evidenceIds: ["ev_lock"] });
  assert.equal(lock.current()?.lockId, "lock_reality");
  lock.release("lock_reality");
  assert.equal(lock.current(), undefined);
});

test("realityIntegrityScore recommends freeze under corruption", () => {
  const score = realityIntegrityScore({ fracture: 1, contamination: 1, confidenceCollapse: 1, semanticDrift: 0.8, fragmentation: 0.8 });
  assert.equal(score.recommendation, "FREEZE");
});

test("truthCorruption detects replay poisoning and semantic corruption", () => {
  assert.equal(truthCorruption(true, false, true, ["ev_truth"]).status, "CORRUPTED");
});

test("fragmentationPressure detects disputed world explosion", () => {
  assert.equal(fragmentationPressure(4, 3, ["ev_fragment"]).status, "FRAGMENTING");
});

test("integrityAttestation rejects low integrity", () => {
  assert.equal(integrityAttestation("trace_integrity", 0.4, ["ev_integrity"]).status, "REJECTED");
});

test("legitimacyPressure escalates override and breach pressure", () => {
  assert.equal(legitimacyPressure(2, 3, 10, ["ev_legit_pressure"]).status, "CRITICAL");
});

test("doctrineErosion detects missing foundational doctrine", () => {
  assert.equal(doctrineErosion(["determinism", "replay"], ["determinism"], ["ev_erosion"]).status, "ERODING");
});

test("constitutionalFatigue detects emergency override saturation", () => {
  assert.equal(constitutionalFatigue(3, 2, 10, ["ev_fatigue_const"]).status, "FATIGUED");
});

test("governanceCoherence reports governance conflict density", () => {
  assert.equal(governanceCoherence(3, 10, ["ev_gov_coherence"]).status, "INCOHERENT");
});

test("constitutionalIntegrity averages legitimacy scores", () => {
  assert.equal(constitutionalIntegrity([0.9, 0.8], ["ev_const_integrity"]).status, "VALID");
});

test("doctrinalConsistency detects inconsistent active doctrine", () => {
  assert.equal(doctrinalConsistency(["a", "b"], ["a"], ["ev_doctrine_consistency"]).status, "INCONSISTENT");
});

test("constitutionalRecursion detects recursive legitimacy paths", () => {
  assert.equal(constitutionalRecursion(["constitution", "governance", "constitution"], ["ev_const_recursion"]).status, "RECURSIVE");
});

test("legitimacyAttestation rejects weak legitimacy", () => {
  assert.equal(legitimacyAttestation("trace_legit", 0.5, ["ev_legit"]).status, "REJECTED");
});

test("parallelReality requires provenance and confidence", () => {
  const reality = parallelReality({ realityId: "world_a", confidence: 0.8, provenanceIds: ["ev_world"] });
  assert.equal(reality.realityId, "world_a");
});

test("disputedWorlds preserves unresolved realities", () => {
  const worlds = disputedWorlds([
    parallelReality({ realityId: "a", confidence: 0.8, provenanceIds: ["ev_a"] }),
    parallelReality({ realityId: "b", confidence: 0.4, provenanceIds: ["ev_b"] })
  ]);
  assert.equal(worlds.status, "DISPUTED");
});

test("probabilisticTimeline enforces monotonic sequence", () => {
  assert.equal(probabilisticTimeline([{ seq: 1, timestamp: 1, probability: 0.6 }]).status, "BOUNDED");
  assert.throws(() => probabilisticTimeline([{ seq: 2, timestamp: 1, probability: 0.5 }, { seq: 1, timestamp: 2, probability: 0.5 }]), /probabilistic_timeline_not_monotonic/);
});

test("operationalConsensus selects threshold-qualified reality", () => {
  const consensus = operationalConsensus([
    parallelReality({ realityId: "a", confidence: 0.6, provenanceIds: ["ev_a"] }),
    parallelReality({ realityId: "b", confidence: 0.9, provenanceIds: ["ev_b"] })
  ], 0.8);
  assert.equal(consensus.status, "CONSENSUS");
  assert.equal(consensus.selectedRealityId, "b");
});

test("conflictingTruths detects conflicting claims", () => {
  assert.equal(conflictingTruths([
    { claimId: "c1", value: "up", evidenceIds: ["ev_1"] },
    { claimId: "c2", value: "down", evidenceIds: ["ev_2"] }
  ]).status, "CONFLICTING");
});

test("realityWeighting normalizes confidence weights", () => {
  const weights = realityWeighting([
    parallelReality({ realityId: "a", confidence: 1, provenanceIds: ["ev_a"] }),
    parallelReality({ realityId: "b", confidence: 1, provenanceIds: ["ev_b"] })
  ]);
  assert.equal(weights[0]?.weight, 0.5);
});

test("timelineDivergence exposes sequence divergence", () => {
  assert.equal(timelineDivergence(10, 12, ["ev_timeline_div"]).status, "DIVERGENT");
});

test("probabilisticCausality remains traceable", () => {
  assert.equal(probabilisticCausality(0.8, 0.8, ["ev_prob_cause"]).status, "OPERATIONALLY_TRUSTED");
});

test("consensusAttestation rejects missing consensus", () => {
  assert.equal(consensusAttestation("trace_consensus", "NO_CONSENSUS", ["ev_consensus"]).status, "REJECTED");
});

test("anomalyAntibodies match known corruption patterns", () => {
  assert.equal(anomalyAntibodies("forged_provenance", ["forged_provenance"], ["ev_ab"]).status, "MATCHED");
});

test("selfNonself distinguishes foreign signatures", () => {
  assert.equal(selfNonself("foreign", ["self"], ["ev_self"]).classification, "NON_SELF");
});

test("cognitiveInfection scores semantic doctrine and identity corruption", () => {
  assert.equal(cognitiveInfection(true, true, false, ["ev_infect"]).status, "INFECTED");
});

test("governanceAutoimmune detects governance blocking legitimacy", () => {
  assert.equal(governanceAutoimmune(true, false, ["ev_autoimmune"]).status, "AUTOIMMUNE_RISK");
});

test("epistemicPathogens sorts pathogen records", () => {
  assert.deepEqual(epistemicPathogens(["z", "a"], ["ev_pathogen"]).pathogens, ["a", "z"]);
});

test("CorruptionQuarantine quarantines before mutation", () => {
  const quarantine = new CorruptionQuarantine();
  const record = quarantine.quarantine("source_a", "infection", ["ev_quarantine"]);
  assert.equal(record.status, "QUARANTINED");
  assert.equal(quarantine.current("source_a")?.reason, "infection");
});

test("ImmuneMemory remembers corruption patterns", () => {
  const memory = new ImmuneMemory();
  memory.remember("forged_provenance", ["ev_memory"]);
  assert.equal(memory.recognizes("forged_provenance"), true);
});

test("survivabilityResponse quarantines non-self corruption", () => {
  assert.equal(survivabilityResponse(0.1, true, ["ev_response"]).action, "QUARANTINE");
});

test("immuneAttestation attests containment", () => {
  assert.equal(immuneAttestation("trace_immune", "QUARANTINE", ["ev_immune"]).status, "CONTAINED");
});

test("truth survivability composes reality integrity multi-reality and immune response", () => {
  const fracture = realityFracture("a", "b", "b", "c", ["ev_fracture"]);
  const consensus = operationalConsensus([
    parallelReality({ realityId: "a", confidence: 0.4, provenanceIds: ["ev_a"] }),
    parallelReality({ realityId: "b", confidence: 0.5, provenanceIds: ["ev_b"] })
  ], 0.8);
  const immune = survivabilityResponse(fracture.fractureScore, consensus.status === "NO_CONSENSUS", ["ev_survive"]);
  assert.equal(consensus.status, "NO_CONSENSUS");
  assert.equal(immune.action, "QUARANTINE");
});

test("existentialBoundary detects missing continuity requirements", () => {
  assert.equal(existentialBoundary(["identity", "doctrine"], ["identity"], ["ev_exist"]).status, "BREACHED");
});

test("continuityCollapse distinguishes operational survival from continuity", () => {
  assert.equal(continuityCollapse(true, false, true, true, ["ev_collapse"]).status, "COLLAPSED");
});

test("selfPreservationDoctrine sacrifices optimization under continuity threat", () => {
  assert.equal(selfPreservationDoctrine(true, true, ["ev_self_preserve"]).action, "SACRIFICE_OPTIMIZATION");
});

test("existentialDrift detects continuity hash changes", () => {
  assert.equal(existentialDrift("a", "b", ["ev_exist_drift"]).status, "DRIFTING");
});

test("continuityAttestation rejects discontinuity", () => {
  assert.equal(continuityAttestation("trace_exist", false, ["ev_attest"]).status, "REJECTED");
});

test("ExistentialMemory preserves remembered continuity records", () => {
  const memory = new ExistentialMemory();
  memory.remember("genesis", ["ev_memory"]);
  assert.equal(memory.has("genesis"), true);
});

test("ContinuityLineage is append-only", () => {
  const lineage = new ContinuityLineage();
  assert.equal(lineage.append("genesis", ["ev_lineage"]).seq, 1);
  assert.equal(lineage.append("phase_2", ["ev_lineage_2"]).seq, 2);
});

test("identityPersistence detects identity discontinuity", () => {
  assert.equal(identityPersistence("id_a", "id_b", ["ev_identity_persist"]).status, "DISCONTINUOUS");
});

test("existentialIntegrity rejects weak continuity score", () => {
  assert.equal(existentialIntegrity([0.5, 0.6], ["ev_exist_integrity"]).status, "UNSTABLE");
});

test("semanticIdentity detects changed doctrine meaning", () => {
  assert.equal(semanticIdentity("deterministic", "adaptive", ["ev_sem_id"]).status, "MEANING_CHANGED");
});

test("doctrineSemantics records replay-safe interpretation", () => {
  assert.equal(doctrineSemantics("D1", "fail closed", ["ev_doc_sem"]).replaySafe, true);
});

test("interpretiveDrift detects missing interpretation terms", () => {
  assert.equal(interpretiveDrift(["fail", "closed"], ["fail"], ["ev_interp"]).status, "DRIFTING");
});

test("meaningCollapse detects semantic coherence loss", () => {
  assert.equal(meaningCollapse(0.2, ["ev_meaning_collapse"]).status, "COLLAPSED");
});

test("SemanticLineage is append-only", () => {
  const lineage = new SemanticLineage();
  assert.equal(lineage.append("meaning_a", ["ev_meaning"]).seq, 1);
});

test("conceptualContinuity detects conceptual fragmentation", () => {
  assert.equal(conceptualContinuity(["truth", "replay"], ["truth"], ["ev_concept"]).status, "FRAGMENTED");
});

test("recursiveMeaning bounds meaning recursion", () => {
  assert.equal(recursiveMeaning(4, 3, ["ev_recursive_meaning"]).status, "UNBOUNDED");
});

test("semanticAttestation rejects unstable meaning", () => {
  assert.equal(semanticAttestation("trace_semantic_attest", false, ["ev_sem_attest"]).status, "REJECTED");
});

test("meaningIntegrity aggregates semantic stability", () => {
  assert.equal(meaningIntegrity([0.8, 0.9], ["ev_meaning_integrity"]).status, "INTACT");
});

test("legitimacyRecursion detects self-legitimization loop", () => {
  assert.equal(legitimacyRecursion(["gov", "constitution", "gov"], ["ev_legit_rec"]).status, "RECURSIVE");
});

test("sovereigntyBoundary blocks out-of-bound emergency authority", () => {
  assert.equal(sovereigntyBoundary("override", ["observe"], ["ev_boundary"]).status, "BOUNDARY_VIOLATION");
});

test("constitutionalSurvival fails when authority discontinuity appears", () => {
  assert.equal(constitutionalSurvival(true, false, ["ev_survival"]).status, "FAILED");
});

test("authorityFracture detects plural authority conflict", () => {
  assert.equal(authorityFracture(["gov_a", "gov_b"], ["ev_authority"]).status, "FRACTURED");
});

test("governanceLegitimacy rejects weak sovereign legitimacy", () => {
  assert.equal(governanceLegitimacy(0.4, ["ev_gov_legit"]).status, "ILLEGITIMATE");
});

test("sovereignAttestation rejects illegitimate sovereignty", () => {
  assert.equal(sovereignAttestation("trace_sovereign", false, ["ev_sovereign"]).status, "REJECTED");
});

test("authorityContinuity detects authority discontinuity", () => {
  assert.equal(authorityContinuity("a", "b", ["ev_auth_cont"]).status, "DISCONTINUOUS");
});

test("sovereign constitutional recursion detects loops", () => {
  assert.equal(sovereignConstitutionalRecursion(["c", "g", "c"], ["ev_sovereign_rec"]).status, "RECURSIVE");
});

test("sovereignIntegrity aggregates authority health", () => {
  assert.equal(sovereignIntegrity([0.9, 0.8], ["ev_sovereign_integrity"]).status, "INTACT");
});

test("agentSocieties counts unique agents", () => {
  assert.equal(agentSocieties(["a", "a", "b"], ["ev_agents"]).agentCount, 2);
});

test("ideologicalConflict detects doctrinal plurality conflict", () => {
  assert.equal(ideologicalConflict(["doctrine_a", "doctrine_b"], ["ev_ideology"]).status, "CONFLICT");
});

test("constitutionalNegotiation records deadlock", () => {
  assert.equal(constitutionalNegotiation(["a", "b"], false, ["ev_negotiation"]).status, "DEADLOCK");
});

test("operationalDiplomacy reports tense unresolved conflicts", () => {
  assert.equal(operationalDiplomacy(3, 1, ["ev_diplomacy"]).status, "TENSE");
});

test("CivilizationalMemory preserves records", () => {
  const memory = new CivilizationalMemory();
  assert.equal(memory.remember("treaty_1", ["ev_civ_mem"]).memorySize, 1);
});

test("doctrinePluralism preserves bounded plurality", () => {
  assert.equal(doctrinePluralism(["a", "b"], true, ["ev_plural"]).status, "BOUNDED_PLURALISM");
});

test("interAgentGovernance rejects illegitimate multi-agent governance", () => {
  assert.equal(interAgentGovernance(3, false, ["ev_inter_agent"]).status, "ILLEGITIMATE");
});

test("CivilizationLineage is append-only", () => {
  const lineage = new CivilizationLineage();
  assert.equal(lineage.append("civ_event", ["ev_civ_lineage"]).seq, 1);
});

test("civilizationIntegrity detects unstable civilization", () => {
  assert.equal(civilizationIntegrity([0.5, 0.6], ["ev_civ_integrity"]).status, "UNSTABLE");
});

test("entropyPressure detects high entropy", () => {
  assert.equal(entropyPressure(10, 5, 3, ["ev_entropy"]).status, "HIGH_ENTROPY");
});

test("coherenceEnergy detects exhaustion", () => {
  assert.equal(coherenceEnergy(2, 3, ["ev_energy"]).status, "EXHAUSTED");
});

test("stabilizationCost detects expensive stabilization", () => {
  assert.equal(stabilizationCost(0.7, 0.5, ["ev_cost"]).status, "EXPENSIVE");
});

test("recursiveHeat detects overheating recursion", () => {
  assert.equal(recursiveHeat(4, 3, ["ev_heat"]).status, "OVERHEATED");
});

test("collapseProximity detects imminent collapse", () => {
  assert.equal(collapseProximity(0.5, 0.4, ["ev_proximity"]).status, "IMMINENT");
});

test("thermodynamicBudget detects budget overrun", () => {
  assert.equal(thermodynamicBudget(1, 2, ["ev_budget"]).status, "OVER_BUDGET");
});

test("cognitiveEntropy detects saturation", () => {
  assert.equal(cognitiveEntropy(7, 5, ["ev_cognitive_entropy"]).status, "SATURATED");
});

test("survivabilityEnergy detects depletion", () => {
  assert.equal(survivabilityEnergy(0.4, 0.6, ["ev_survivability_energy"]).status, "DEPLETED");
});

test("equilibriumEngine detects destabilization", () => {
  assert.equal(equilibriumEngine({ entropy: 1, heat: 1, cost: 1, energy: 2, evidenceIds: ["ev_equilibrium"] }).status, "DESTABILIZED");
});

test("thermodynamicAttestation rejects unstable thermodynamic state", () => {
  assert.equal(thermodynamicAttestation("trace_thermo", false, ["ev_thermo"]).status, "REJECTED");
});

test("existential thermodynamic stack composes into stabilization failure", () => {
  const continuity = continuityCollapse(true, true, false, true, ["ev_continuity_stack"]);
  const entropy = entropyPressure(10, 6, 4, ["ev_entropy_stack"]);
  const equilibrium = equilibriumEngine({ entropy: entropy.score, heat: 1, cost: 1, energy: 1, evidenceIds: ["ev_equilibrium_stack"] });
  assert.equal(continuity.status, "COLLAPSED");
  assert.equal(entropy.status, "HIGH_ENTROPY");
  assert.equal(equilibrium.status, "DESTABILIZED");
});

test("existentialBoundary requires evidence", () => {
  assert.throws(() => existentialBoundary(["identity"], ["identity"], []), /existential_boundary_requires_evidence/);
});

test("semanticIdentity requires provenance lineage", () => {
  assert.throws(() => semanticIdentity("a", "a", []), /semantic_identity_requires_evidence/);
});

test("sovereigntyBoundary requires explicit evidence", () => {
  assert.throws(() => sovereigntyBoundary("observe", ["observe"], []), /sovereignty_boundary_requires_evidence/);
});

test("agentSocieties requires replayable evidence", () => {
  assert.throws(() => agentSocieties(["a"], []), /agent_societies_requires_evidence/);
});

test("entropyPressure requires valid event denominator", () => {
  assert.throws(() => entropyPressure(0, 1, 1, ["ev_entropy_bad"]), /entropy_pressure_requires_evidence/);
});

test("recursiveMeaning accepts bounded recursion", () => {
  assert.equal(recursiveMeaning(2, 3, ["ev_recursive_ok"]).status, "BOUNDED");
});

test("governanceLegitimacy accepts strong sovereign legitimacy", () => {
  assert.equal(governanceLegitimacy(0.9, ["ev_gov_legit_ok"]).status, "LEGITIMATE");
});

test("constitutionalNegotiation records agreement deterministically", () => {
  assert.equal(constitutionalNegotiation(["b", "a"], true, ["ev_negotiation_ok"]).parties.join(","), "a,b");
});

test("thermodynamicBudget accepts sustainable budget", () => {
  assert.equal(thermodynamicBudget(3, 2, ["ev_budget_ok"]).status, "WITHIN_BUDGET");
});

test("equilibriumEngine accepts stable thermodynamic equilibrium", () => {
  assert.equal(equilibriumEngine({ entropy: 0.2, heat: 0.2, cost: 0.2, energy: 1, evidenceIds: ["ev_equilibrium_ok"] }).status, "EQUILIBRIUM");
});

test("replay metrics track throughput", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), []);

  const health = runtime.healthSnapshot();
  assert.equal(health.replayEventsProcessed, 3);
  assert.equal(health.replayThroughputEventsPerSecond > 0, true);

  await runtime.stop();
});

test("critical metric breaches are audited", async () => {
  const config = { ...baseConfig, maxReplayLag: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  assert.deepEqual(runtime.replayPersisted(), []);

  const breaches = audit.entries("runtime_metric_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.metric, "replay_lag");
  assert.equal(breaches[0]?.value, 2);
  assert.equal(breaches[0]?.threshold, 1);

  await runtime.stop();
});

test("runtime periodically audits health reports", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await new Promise((resolve) => setTimeout(resolve, 1_050));

  const reports = audit.entries("runtime_health_report");
  assert.equal(reports.length >= 1, true);
  assert.equal(typeof reports[0]?.metrics?.eventsProcessed, "number");
  assert.equal(reports[0]?.metrics?.mode, "NORMAL");

  await runtime.stop();
});

test("smoke: market tick to DRY_RUN order persists, audits, metrics, and replays", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_smoke_success",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_smoke_success",
    causationId: "signal_smoke_success",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "MARKET_TICK",
    "INTENT_CREATED",
    "ORDER_SUBMITTED"
  ]);
  assert.equal(eventStore.events[2]?.source, "execution");
  assert.equal(eventStore.events[2]?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("event_accepted").length, 3);
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);

  const healthBeforeReplay = runtime.healthSnapshot();
  assert.equal(healthBeforeReplay.eventsProcessed, 3);
  assert.equal(healthBeforeReplay.eventsRejected, 0);
  assert.equal(healthBeforeReplay.safeModeCount, 0);

  assert.deepEqual(runtime.replayPersisted(), []);
  const healthAfterReplay = runtime.healthSnapshot();
  assert.equal(healthAfterReplay.replayEventsProcessed, 3);
  assert.equal(healthAfterReplay.replayThroughputEventsPerSecond > 0, true);

  await runtime.stop();
});

test("smoke: stale market data enters SAFE_MODE without DRY_RUN order", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });
  const staleTimestamp = Date.now() - 10_000;

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_smoke_failure",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_smoke_failure",
    causationId: "signal_smoke_failure",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(eventStore.events.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  assert.equal(eventStore.events[1]?.payload.reason, "stale_data_halt");
  assert.equal(audit.entries("safe_mode_entered").length, 1);
  assert.equal(audit.entries("safe_mode_entered")[0]?.reason, "stale_data_halt");

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 2);
  assert.equal(health.eventsRejected, 0);
  assert.equal(health.safeModeCount, 1);

  await runtime.stop();
});

test("kernel reduction validates minimum viable invariants deterministically", () => {
  const viable = Kernel.minimumViableInvariants(Kernel.KERNEL_INVARIANTS, ["ev_kernel"]);
  assert.equal(viable.status, "VIABLE");
  assert.deepEqual(viable.missing, []);

  const nonViable = Kernel.minimumViableInvariants(["identity_continuity"], ["ev_kernel"]);
  assert.equal(nonViable.status, "NON_VIABLE");
  assert.equal(nonViable.missing.includes("append_only_memory"), true);
});

test("kernel memory is append-only and evidence-bound", () => {
  const memory = new Kernel.KernelMemory();
  assert.deepEqual(memory.append("artifact_a", ["ev_a"]), { seq: 1, artifactId: "artifact_a", evidenceIds: ["ev_a"] });
  assert.deepEqual(memory.append("artifact_b", ["ev_b"]), { seq: 2, artifactId: "artifact_b", evidenceIds: ["ev_b"] });
  assert.throws(() => memory.append("artifact_c", []), /kernel_memory_requires_evidence/);
});

test("kernel governance fails closed without constitutional legitimacy", () => {
  assert.equal(Kernel.kernelGovernance(true, true, ["ev_gov"]).status, "LEGITIMATE");
  assert.equal(Kernel.kernelGovernance(false, true, ["ev_gov"]).status, "FAILED");
});

test("kernel truth requires causal explainability and replayability", () => {
  assert.equal(Kernel.kernelTruth(true, true, ["ev_truth"]).status, "TRUSTED");
  assert.equal(Kernel.kernelTruth(true, false, ["ev_truth"]).status, "UNUSABLE");
});

test("kernel recovery requires all continuity artifacts", () => {
  const ready = Kernel.kernelRecovery(["identity", "memory", "governance", "truth"], ["ev_recovery"]);
  assert.equal(ready.status, "REBUILD_READY");

  const insufficient = Kernel.kernelRecovery(["identity", "memory"], ["ev_recovery"]);
  assert.equal(insufficient.status, "INSUFFICIENT");
  assert.deepEqual(insufficient.missing, ["governance", "truth"]);
});

test("kernel identity and attestation remain replay-safe", () => {
  const identity = Kernel.kernelIdentity("runtime_a", "hash_a", ["ev_identity"]);
  assert.equal(identity.replaySafe, true);
  assert.equal(Kernel.kernelAttestation("trace_kernel", true, ["ev_identity"]).status, "ATTESTED");
  assert.equal(Kernel.kernelAttestation("trace_kernel", false, ["ev_identity"]).status, "REJECTED");
});

test("operational compression deduplicates and sorts deterministically", () => {
  const result = Compression.operationalCompression(["b", "a", "b"], ["ev_compress"]);
  assert.equal(result.status, "COMPRESSED");
  assert.deepEqual(result.compressed, ["a", "b"]);
  assert.equal(result.originalCount, 3);
});

test("loss-aware compression declares any operational loss", () => {
  const result = Compression.lossAwareCompression(["causal_lineage"], ["verbose_note"], ["ev_loss"]);
  assert.equal(result.status, "LOSS_DECLARED");
  assert.deepEqual(result.lost, ["verbose_note"]);
});

test("causal compression preserves edge count without losing causal structure", () => {
  const result = Compression.causalCompression(["a->b", "a->b", "b->c"], ["ev_causal"]);
  assert.equal(result.status, "CAUSALITY_PRESERVED");
  assert.equal(result.edgeCount, 2);
});

test("compression evidence compaction preserves deterministic lineage set", () => {
  const result = Compression.evidenceCompaction(["ev_b", "ev_a", "ev_b"]);
  assert.deepEqual(result.compactedEvidenceIds, ["ev_a", "ev_b"]);
  assert.equal(result.originalCount, 3);
});

test("semantic compression rejects summaries that do not preserve meaning", () => {
  const preserved = Compression.semanticCompression(true, ["truth continuity", "truth continuity"], ["ev_semantic"]);
  assert.equal(preserved.status, "MEANING_PRESERVED");
  assert.equal(preserved.summary, "truth continuity");

  const rejected = Compression.semanticCompression(false, ["truth continuity"], ["ev_semantic"]);
  assert.equal(rejected.status, "REJECTED");
});

test("constitutional preservation blocks lossy invariant compression", () => {
  const result = Compression.constitutionalPreservation(["replay"], ["replay", "governance"], ["ev_constitution"]);
  assert.equal(result.status, "BROKEN");
  assert.deepEqual(result.missing, ["governance"]);
});

test("replay preserving compression detects digest divergence", () => {
  assert.equal(Compression.replayPreservingCompression("digest", "digest", ["ev_replay"]).status, "REPLAY_PRESERVED");
  assert.equal(Compression.replayPreservingCompression("digest_a", "digest_b", ["ev_replay"]).status, "REPLAY_BROKEN");
});

test("compression audit remains append-only", () => {
  const audit = new Compression.CompressionAudit();
  assert.deepEqual(audit.append("semantic_compaction", ["ev_audit"]), {
    seq: 1,
    action: "semantic_compaction",
    evidenceIds: ["ev_audit"]
  });
  assert.deepEqual(audit.append("causal_compaction", ["ev_audit_2"]), {
    seq: 2,
    action: "causal_compaction",
    evidenceIds: ["ev_audit_2"]
  });
});

test("arbitration policy reaches bounded finality only above threshold", () => {
  const arbitrate = Arbitration.arbitrationPolicy({
    contradictionWeight: 0.1,
    provenanceStrength: 0.9,
    temporalConsistency: 0.9,
    survivabilityPriority: 0.9,
    governanceLegitimacy: 0.9,
    replayConsistency: 0.9,
    operationalUrgency: 0.9,
    evidenceIds: ["ev_arbitration"]
  });
  assert.equal(arbitrate.status, "ARBITRATE");

  const degrade = Arbitration.arbitrationPolicy({
    contradictionWeight: 0.9,
    provenanceStrength: 0.2,
    temporalConsistency: 0.2,
    survivabilityPriority: 0.2,
    governanceLegitimacy: 0.2,
    replayConsistency: 0.2,
    operationalUrgency: 0.2,
    evidenceIds: ["ev_arbitration"]
  });
  assert.equal(degrade.status, "DEGRADE");
});

test("conflict weighting makes provenance conflicts more expensive", () => {
  const result = Arbitration.conflictWeighting(2, 3, ["ev_conflict"]);
  assert.equal(result.weight, 0.8);
});

test("survivability priority favors safe mode over execution urgency", () => {
  assert.equal(Arbitration.survivabilityPriority(true, true, ["ev_survival"]).priority, 1);
  assert.equal(Arbitration.survivabilityPriority(false, true, ["ev_survival"]).priority, 0.7);
});

test("operational finality preserves disputed history", () => {
  const finality = Arbitration.operationalFinality(true, 0.8, ["ev_final"]);
  assert.equal(finality.status, "FINAL");
  assert.equal(finality.preserveDisputeHistory, true);

  assert.equal(Arbitration.operationalFinality(true, 0.6, ["ev_final"]).status, "NOT_FINAL");
});

test("reality precedence uses deterministic tie-breaking", () => {
  const result = Arbitration.realityPrecedence([
    { realityId: "reality_b", score: 0.8, evidenceIds: ["ev_b"] },
    { realityId: "reality_a", score: 0.8, evidenceIds: ["ev_a"] }
  ]);
  assert.equal(result.selectedRealityId, "reality_a");
  assert.deepEqual(result.evidenceIds, ["ev_a"]);
});

test("arbitration attestation and disputed resolution preserve audit lineage", () => {
  assert.equal(Arbitration.arbitrationAttestation("trace_arb", false, ["ev_arb"]).status, "REJECTED");
  const resolution = Arbitration.disputedResolution("dispute_a", "safe_mode", ["ev_resolve"]);
  assert.equal(resolution.preserveHistory, true);
});

test("metastability flags critical recursion pressure", () => {
  const result = Metastability.recursionPressure(10, 10, ["ev_recursion"]);
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.pressure, 1);
});

test("metastability detects adaptation instability by bounded window rate", () => {
  const unstable = Metastability.adaptationInstability(6, 10, ["ev_adaptation"]);
  assert.equal(unstable.status, "UNSTABLE");

  const stable = Metastability.adaptationInstability(1, 10, ["ev_adaptation"]);
  assert.equal(stable.status, "STABLE");
});

test("metastability detects governance recursion risk", () => {
  assert.equal(Metastability.governanceRecursionRisk(true, ["ev_gov_loop"]).status, "RISK");
  assert.equal(Metastability.governanceRecursionRisk(false, ["ev_gov_loop"]).status, "CLEAR");
});

test("semantic feedback instability rejects amplification loops", () => {
  assert.equal(Metastability.semanticFeedbackInstability(1.2, ["ev_feedback"]).status, "AMPLIFYING");
  assert.equal(Metastability.semanticFeedbackInstability(0.8, ["ev_feedback"]).status, "BOUNDED");
});

test("stabilization orchestrator contains recursive risks while preserving continuity", () => {
  const result = Metastability.stabilizationOrchestrator(["explainability_loop", "arbitration_loop"], ["ev_stabilize"]);
  assert.equal(result.action, "CONTAIN_RECURSION");
  assert.equal(result.preserveConstitutionalContinuity, true);
  assert.deepEqual(result.risks, ["arbitration_loop", "explainability_loop"]);
});

test("runaway detector and feedback guard contain self-referential loops", () => {
  assert.equal(Metastability.runawayDetector(11, 10, ["ev_runaway"]).status, "RUNAWAY");

  const guarded = Metastability.feedbackLoopGuard(["governance", "explainability", "governance"], ["ev_loop"]);
  assert.equal(guarded.status, "CONTAIN");
  assert.equal(guarded.repeated, "governance");
});

test("metastability attestation rejects unstable runtime state", () => {
  assert.equal(Metastability.metastabilityAttestation("trace_meta", true, ["ev_meta"]).status, "STABLE");
  assert.equal(Metastability.metastabilityAttestation("trace_meta", false, ["ev_meta"]).status, "REJECTED");
});

test("graceful collapse requires deterministic terminal ordering", () => {
  const ready = Mortality.gracefulCollapse(Mortality.GRACEFUL_COLLAPSE_ORDER, ["ev_collapse"]);
  assert.equal(ready.status, "COLLAPSE_READY");
  assert.equal(ready.replaySafe, true);
  assert.deepEqual(ready.order, ["FREEZE_INPUTS", "PRESERVE_LINEAGE", "FINALIZE_TRUTH", "TERMINATE_AUTHORITY"]);

  const unsafe = Mortality.gracefulCollapse(["FREEZE_INPUTS", "PRESERVE_LINEAGE"], ["ev_collapse"]);
  assert.equal(unsafe.status, "COLLAPSE_UNSAFE");
  assert.deepEqual(unsafe.missing, ["FINALIZE_TRUTH", "TERMINATE_AUTHORITY"]);
});

test("identity-preserving shutdown records append-only terminal lineage", () => {
  const shutdown = new Mortality.IdentityPreservingShutdown();
  assert.deepEqual(shutdown.append("runtime_a", "hash_a", "gov_a", ["ev_identity_shutdown"]), {
    seq: 1,
    runtimeId: "runtime_a",
    continuityHash: "hash_a",
    governanceLineageId: "gov_a",
    evidenceIds: ["ev_identity_shutdown"]
  });
  assert.deepEqual(shutdown.append("runtime_a", "hash_b", "gov_b", ["ev_identity_shutdown_2"]), {
    seq: 2,
    runtimeId: "runtime_a",
    continuityHash: "hash_b",
    governanceLineageId: "gov_b",
    evidenceIds: ["ev_identity_shutdown_2"]
  });
  assert.equal(shutdown.terminalIdentity()?.continuityHash, "hash_b");
});

test("epistemic last state preserves terminal truth history", () => {
  const state = Mortality.epistemicLastState({
    lastTrustedRealityId: "reality_final",
    disputedRealityIds: ["reality_z", "reality_a"],
    finalConfidence: 0.64,
    finalGovernanceDecisionId: "decision_final",
    finalConstitutionalStatus: "FAILED",
    finalCausalChain: ["cause_a", "cause_b"],
    evidenceIds: ["ev_truth_final"]
  });
  assert.equal(state.status, "TERMINAL_TRUTH_RECORDED");
  assert.deepEqual(state.disputedRealityIds, ["reality_a", "reality_z"]);
  assert.equal(state.replayable, true);
});

test("constitutional failure declares constitutional death deterministically", () => {
  const death = Mortality.constitutionalFailure({
    doctrineErosion: true,
    governanceIllegitimacy: true,
    continuityCollapse: false,
    existentialDiscontinuity: true,
    authorityFracture: false,
    evidenceIds: ["ev_constitutional_death"]
  });
  assert.equal(death.status, "CONSTITUTIONAL_DEATH");
  assert.equal(death.terminateAuthority, true);
  assert.deepEqual(death.causes, ["doctrine_erosion", "existential_discontinuity", "governance_illegitimacy"]);

  assert.equal(Mortality.constitutionalFailure({
    doctrineErosion: false,
    governanceIllegitimacy: false,
    continuityCollapse: false,
    existentialDiscontinuity: false,
    authorityFracture: false,
    evidenceIds: ["ev_legitimate"]
  }).status, "LEGITIMATE");
});

test("survivable handoff verifies lineage transfer before succession", () => {
  const ready = Mortality.survivableHandoff({
    sourceRuntimeId: "runtime_a",
    targetRuntimeId: "runtime_b",
    governanceLineageTransferred: true,
    constitutionalLineageTransferred: true,
    memoryContinuityTransferred: true,
    identityAttestationTransferred: true,
    replayContinuityTransferred: true,
    evidenceIds: ["ev_handoff"]
  });
  assert.equal(ready.status, "HANDOFF_READY");
  assert.equal(ready.attestedGovernanceContinuity, true);
  assert.equal(ready.replaySafe, true);

  const blocked = Mortality.survivableHandoff({
    sourceRuntimeId: "runtime_a",
    targetRuntimeId: "runtime_b",
    governanceLineageTransferred: true,
    constitutionalLineageTransferred: false,
    memoryContinuityTransferred: true,
    identityAttestationTransferred: true,
    replayContinuityTransferred: true,
    evidenceIds: ["ev_handoff"]
  });
  assert.equal(blocked.status, "HANDOFF_BLOCKED");
});

test("mortality attestation requires replayable terminal continuity", () => {
  assert.equal(Mortality.mortalityAttestation("trace_death", true, true, ["ev_mortality"]).status, "MORTALITY_ATTESTED");
  assert.equal(Mortality.mortalityAttestation("trace_death", true, false, ["ev_mortality"]).status, "MORTALITY_REJECTED");
});

test("terminal continuity detects missing final artifacts", () => {
  const continuity = Mortality.terminalContinuity(
    ["identity", "truth"],
    ["identity", "truth", "governance"],
    ["ev_terminal"]
  );
  assert.equal(continuity.status, "CONTINUITY_BROKEN");
  assert.deepEqual(continuity.missing, ["governance"]);
});

test("collapse lineage remains append-only and evidence-bound", () => {
  const lineage = new Mortality.CollapseLineage();
  assert.deepEqual(lineage.append("FREEZE_INPUTS", "fragmentation", ["ev_lineage"]), {
    seq: 1,
    phase: "FREEZE_INPUTS",
    cause: "fragmentation",
    evidenceIds: ["ev_lineage"]
  });
  assert.deepEqual(lineage.append("FINALIZE_TRUTH", "constitutional_death", ["ev_lineage_2"]), {
    seq: 2,
    phase: "FINALIZE_TRUTH",
    cause: "constitutional_death",
    evidenceIds: ["ev_lineage_2"]
  });
});

test("final governance state captures terminal authority legitimacy", () => {
  const failed = Mortality.finalGovernanceState(["policy_b", "policy_a"], "decision_terminal", false, ["ev_final_gov"]);
  assert.equal(failed.status, "FINAL_GOVERNANCE_FAILED");
  assert.equal(failed.authorityTerminated, true);
  assert.deepEqual(failed.policyIds, ["policy_a", "policy_b"]);
});

test("existential termination prefers coherent death over unsafe survival", () => {
  const coherent = Mortality.existentialTermination({
    constitutionalDeath: true,
    terminalContinuityPreserved: true,
    finalTruthRecorded: true,
    identityPreserved: true,
    governanceLineagePreserved: true,
    evidenceIds: ["ev_termination"]
  });
  assert.equal(coherent.status, "COHERENT_TERMINATION");
  assert.equal(coherent.operationMayContinue, false);

  const unsafe = Mortality.existentialTermination({
    constitutionalDeath: true,
    terminalContinuityPreserved: false,
    finalTruthRecorded: true,
    identityPreserved: true,
    governanceLineagePreserved: true,
    evidenceIds: ["ev_termination"]
  });
  assert.equal(unsafe.status, "TERMINATION_UNSAFE");
});

test("mortality APIs fail closed without terminal evidence", () => {
  assert.throws(() => Mortality.gracefulCollapse(Mortality.GRACEFUL_COLLAPSE_ORDER, []), /graceful_collapse_requires_evidence/);
  assert.throws(() => Mortality.mortalityAttestation("trace_death", true, true, []), /mortality_attestation_requires_evidence/);
  assert.throws(() => Mortality.terminalContinuity(["identity"], ["identity"], []), /terminal_continuity_requires_evidence/);
});

test("survivability primitives require complete executable primitive set", () => {
  const complete = Convergence.survivabilityPrimitives(Convergence.SURVIVABILITY_PRIMITIVES, ["ev_primitives"]);
  assert.equal(complete.status, "PRIMITIVES_COMPLETE");

  const incomplete = Convergence.survivabilityPrimitives(["preserve_identity_lineage"], ["ev_primitives"]);
  assert.equal(incomplete.status, "PRIMITIVES_INCOMPLETE");
  assert.equal(incomplete.missing.includes("preserve_recovery_path"), true);
});

test("abstraction collapse is blocked when replay or continuity weakens", () => {
  const allowed = Convergence.abstractionCollapse({
    abstractionId: "semantic_layer_a",
    primitiveId: "preserve_operator_explainability",
    justification: "maps explanation surface to operator primitive",
    replayPreserved: true,
    constitutionalContinuityPreserved: true,
    explainabilityPreserved: true,
    evidenceIds: ["ev_collapse_map"]
  });
  assert.equal(allowed.status, "COLLAPSE_ALLOWED");

  const blocked = Convergence.abstractionCollapse({
    abstractionId: "truth_layer_a",
    primitiveId: "preserve_replayable_truth",
    justification: "unsafe replay loss",
    replayPreserved: false,
    constitutionalContinuityPreserved: true,
    explainabilityPreserved: true,
    evidenceIds: ["ev_collapse_map"]
  });
  assert.equal(blocked.status, "COLLAPSE_BLOCKED");
});

test("operational reduction retains layers that protect required primitives", () => {
  const result = Convergence.operationalReduction([
    {
      layerId: "cosmology_layer",
      mappedPrimitiveIds: [],
      operationalValue: 1,
      complexityCost: 4,
      replayPreservedIfRemoved: true,
      identityPreservedIfRemoved: true,
      mortalityPreservedIfRemoved: true,
      recoveryPreservedIfRemoved: true,
      evidenceIds: ["ev_reduce_a"]
    },
    {
      layerId: "identity_layer",
      mappedPrimitiveIds: ["preserve_identity_lineage"],
      operationalValue: 5,
      complexityCost: 3,
      replayPreservedIfRemoved: false,
      identityPreservedIfRemoved: false,
      mortalityPreservedIfRemoved: true,
      recoveryPreservedIfRemoved: true,
      evidenceIds: ["ev_reduce_b"]
    }
  ], ["preserve_identity_lineage"], ["ev_reduce"]);
  assert.equal(result.status, "REDUCTION_EVALUATED");
  assert.equal(result.decisions[0]?.action, "CANDIDATE_FOR_REMOVAL");
  assert.equal(result.decisions[1]?.action, "RETAIN");
});

test("cognitive surface area flags semantic over-expansion", () => {
  assert.equal(Convergence.cognitiveSurfaceArea(10, 4, 1, ["ev_surface"]).status, "SURFACE_AREA_BOUNDED");
  assert.equal(Convergence.cognitiveSurfaceArea(30, 10, 5, ["ev_surface"]).status, "SURFACE_AREA_EXCESSIVE");
});

test("execution essentialism separates missing essentials from surplus capabilities", () => {
  const result = Convergence.executionEssentialism(["halt", "recover", "explain"], ["halt", "recover", "truth"], ["ev_exec"]);
  assert.equal(result.status, "EXECUTION_ESSENTIALS_MISSING");
  assert.deepEqual(result.missing, ["truth"]);
  assert.deepEqual(result.surplus, ["explain"]);
});

test("convergence audit is append-only and reversible-aware", () => {
  const audit = new Convergence.ConvergenceAudit();
  assert.deepEqual(audit.append("collapse", "semantic_layer", true, ["ev_audit"]), {
    seq: 1,
    action: "collapse",
    targetId: "semantic_layer",
    reversible: true,
    evidenceIds: ["ev_audit"]
  });
  assert.equal(audit.all().length, 1);
});

test("primitive attestation rejects nonessential primitive claims", () => {
  assert.equal(Convergence.primitiveAttestation("preserve_safe_halt", true, true, true, ["ev_primitive"]).status, "PRIMITIVE_ATTESTED");
  assert.equal(Convergence.primitiveAttestation("decorative_abstraction", false, true, true, ["ev_primitive"]).status, "PRIMITIVE_REJECTED");
});

test("simplicity doctrine requires all active removal principles", () => {
  assert.equal(Simplicity.simplicityDoctrine(Simplicity.SIMPLICITY_DOCTRINE, ["ev_doctrine"]).status, "DOCTRINE_ACTIVE");
  assert.equal(Simplicity.simplicityDoctrine(["simplify_before_expanding"], ["ev_doctrine"]).status, "DOCTRINE_INCOMPLETE");
});

test("complexity-value ratio identifies deficient architecture value", () => {
  const deficient = Simplicity.complexityValueRatio({
    conceptValue: 1,
    operationalValue: 1,
    testValue: 1,
    recoveryValue: 1,
    governanceValue: 1,
    explainabilityValue: 1,
    complexityCost: 4,
    maintenanceCost: 2,
    cognitiveBurden: 2,
    recursionRisk: 2,
    evidenceIds: ["ev_ratio"]
  });
  assert.equal(deficient.status, "VALUE_DEFICIENT");

  const justified = Simplicity.complexityValueRatio({
    conceptValue: 3,
    operationalValue: 4,
    testValue: 2,
    recoveryValue: 2,
    governanceValue: 3,
    explainabilityValue: 2,
    complexityCost: 2,
    maintenanceCost: 2,
    cognitiveBurden: 1,
    recursionRisk: 1,
    evidenceIds: ["ev_ratio"]
  });
  assert.equal(justified.status, "VALUE_JUSTIFIED");
});

test("removal candidates require low value and preserved continuity", () => {
  const result = Simplicity.removalCandidates([
    {
      conceptId: "ornamental_abstraction",
      conceptValue: 1,
      operationalValue: 1,
      testValue: 0,
      recoveryValue: 0,
      governanceValue: 0,
      explainabilityValue: 1,
      complexityCost: 4,
      maintenanceCost: 2,
      cognitiveBurden: 3,
      recursionRisk: 2,
      removalPreservesContinuity: true,
      removalPreservesReplay: true,
      removalPreservesExplainability: true,
      reversible: true,
      evidenceIds: ["ev_remove"]
    }
  ], ["ev_remove_eval"]);
  assert.equal(result.evaluated[0]?.status, "REMOVAL_CANDIDATE");
});

test("survivability retention blocks removal of non-removable capabilities", () => {
  const unsafe = Simplicity.survivabilityRetention(["identity_lineage"], ["ev_retention"]);
  assert.equal(unsafe.status, "RETENTION_UNSAFE");
  assert.equal(unsafe.missing.includes("replay_determinism"), true);

  const safe = Simplicity.survivabilityRetention(Simplicity.NON_REMOVABLE_CAPABILITIES, ["ev_retention"]);
  assert.equal(safe.status, "RETENTION_SAFE");
});

test("essential structure reports surplus without deleting it", () => {
  const result = Simplicity.essentialStructure(["kernel", "mortality", "cosmology"], ["kernel", "mortality"], ["ev_structure"]);
  assert.equal(result.status, "ESSENTIAL_STRUCTURE_PRESENT");
  assert.deepEqual(result.surplus, ["cosmology"]);
});

test("operational minimalism identifies removable nonessential count", () => {
  const result = Simplicity.operationalMinimalism(12, 7, ["ev_minimalism"]);
  assert.equal(result.status, "SIMPLIFICATION_AVAILABLE");
  assert.equal(result.removableCount, 5);
});

test("simplification audit preserves reversible recommendations", () => {
  const audit = new Simplicity.SimplificationAudit();
  assert.deepEqual(audit.append("remove_candidate", "low operational leverage", true, ["ev_simplify"]), {
    seq: 1,
    recommendation: "remove_candidate",
    justification: "low operational leverage",
    reversible: true,
    evidenceIds: ["ev_simplify"]
  });
});

test("convergence and simplicity APIs fail closed without evidence", () => {
  assert.throws(() => Convergence.survivabilityPrimitives(Convergence.SURVIVABILITY_PRIMITIVES, []), /survivability_primitives_require_evidence/);
  assert.throws(() => Convergence.cognitiveSurfaceArea(1, 1, 1, []), /cognitive_surface_area_requires_evidence/);
  assert.throws(() => Simplicity.operationalMinimalism(1, 1, []), /operational_minimalism_requires_evidence/);
  assert.throws(() => Simplicity.survivabilityRetention(Simplicity.NON_REMOVABLE_CAPABILITIES, []), /survivability_retention_requires_evidence/);
});

test("trust field detects concentration decay and fragmentation", () => {
  const result = Field.trustField([
    { domainId: "identity", trust: 0.9, incomingTrust: ["governance", "truth", "operator"], evidenceIds: ["ev_trust_a"] },
    { domainId: "reality", trust: 0.2, incomingTrust: [], evidenceIds: ["ev_trust_b"] }
  ], ["ev_trust"]);
  assert.equal(result.status, "TRUST_FRAGMENTED");
  assert.equal(result.nodes[0]?.status, "CONCENTRATED");
  assert.equal(result.nodes[1]?.status, "DECAYED");
});

test("coherence field identifies weak operational zones", () => {
  const result = Field.coherenceField([
    { domainId: "kernel", coherence: 0.9, evidenceIds: ["ev_coherence_a"] },
    { domainId: "semantic", coherence: 0.3, evidenceIds: ["ev_coherence_b"] }
  ], ["ev_coherence"]);
  assert.equal(result.status, "COHERENCE_WEAK_ZONE");
  assert.equal(result.zones[1]?.status, "LOW_COHERENCE");
});

test("instability gradient maps spreading vectors deterministically", () => {
  const result = Field.instabilityGradient([
    { from: "governance", to: "identity", instabilityDelta: 0.7, evidenceIds: ["ev_gradient"] }
  ], ["ev_gradient"]);
  assert.equal(result.status, "INSTABILITY_PROPAGATING");
  assert.equal(result.vectors[0]?.status, "SPREADING");
});

test("governance tension detects constitutional pressure accumulation", () => {
  const result = Field.governanceTension([
    { domainId: "policy", constitutionalPressure: 0.8, policyConflict: 0.8, evidenceIds: ["ev_tension"] }
  ], ["ev_tension"]);
  assert.equal(result.status, "GOVERNANCE_TENSION_ACCUMULATING");
  assert.equal(result.tensions[0]?.score, 0.8);
});

test("semantic density map detects abstraction-heavy low-execution zones", () => {
  const result = Field.semanticDensityMap([
    { domainId: "meaning", abstractionCount: 12, executionValue: 3, evidenceIds: ["ev_density"] }
  ], ["ev_density"]);
  assert.equal(result.status, "OVERLOAD_FORMING");
  assert.equal(result.zones[0]?.status, "SEMANTIC_OVERLOAD");
});

test("survivability topology identifies existential single points of failure", () => {
  const result = Field.survivabilityTopology([
    { componentId: "kernel", continuityCriticality: 0.95, redundancy: 0, evidenceIds: ["ev_topology"] }
  ], ["ev_topology"]);
  assert.equal(result.status, "EXISTENTIAL_SINGLE_POINT_RISK");
  assert.equal(result.components[0]?.singlePointRisk, true);
});

test("field attestation requires replay safety and provenance", () => {
  assert.equal(Field.fieldAttestation("trace_field", true, true, ["ev_field"]).status, "FIELD_ATTESTED");
  assert.equal(Field.fieldAttestation("trace_field", true, false, ["ev_field"]).status, "FIELD_REJECTED");
});

test("threat memory is append-only and supports recurring signature lookup", () => {
  const memory = new AdaptiveImmune.ThreatMemory();
  memory.append("forged_provenance", "quarantine", true, ["ev_threat"]);
  memory.append("forged_provenance", "freeze_truth", true, ["ev_threat_2"]);
  assert.equal(memory.seen("forged_provenance").length, 2);
  assert.equal(memory.all()[1]?.seq, 2);
});

test("epistemic antibodies distinguish recurring attacks from novel signatures", () => {
  assert.equal(AdaptiveImmune.epistemicAntibodies("poisoning_a", ["poisoning_a"], ["ev_antibody"]).status, "ANTIBODY_MATCH");
  assert.equal(AdaptiveImmune.epistemicAntibodies("poisoning_b", ["poisoning_a"], ["ev_antibody"]).status, "ANTIBODY_GENERATED");
});

test("mutation tolerance quarantines doctrine mutation and envelope breaches", () => {
  assert.equal(AdaptiveImmune.mutationTolerance(0.2, 0.5, false, ["ev_mutation"]).status, "MUTATION_TOLERATED");
  assert.equal(AdaptiveImmune.mutationTolerance(0.2, 0.5, true, ["ev_mutation"]).status, "MUTATION_QUARANTINED");
});

test("governance immunity freezes governance mutation under capture signals", () => {
  const result = AdaptiveImmune.governanceImmunity(false, true, false, ["ev_gov_immune"]);
  assert.equal(result.status, "GOVERNANCE_IMMUNE_RESPONSE");
  assert.equal(result.response, "freeze_governance_mutation");
});

test("continuity defense prioritizes identity and existential continuity", () => {
  const result = AdaptiveImmune.continuityDefense(0.4, 1, 0.2, ["ev_continuity_defense"]);
  assert.equal(result.status, "CONTINUITY_UNDER_ATTACK");
  assert.equal(result.response, "preserve_identity_and_halt_mutation");
});

test("immune learning records survivability patterns without doctrine mutation", () => {
  const learned = AdaptiveImmune.immuneLearning(["quarantine"], "freeze_truth", ["ev_learning"]);
  assert.equal(learned.status, "PATTERN_LEARNED");
  assert.equal(learned.doctrineMutated, false);

  const reinforced = AdaptiveImmune.immuneLearning(["quarantine"], "quarantine", ["ev_learning"]);
  assert.equal(reinforced.status, "PATTERN_REINFORCED");
});

test("adaptive quarantine switches known and novel threat protocols", () => {
  const known = AdaptiveImmune.adaptiveQuarantine(true, 0.4, 0.3, ["ev_quarantine"]);
  assert.equal(known.status, "QUARANTINE");
  assert.equal(known.mode, "KNOWN_THREAT_PROTOCOL");

  const novel = AdaptiveImmune.adaptiveQuarantine(false, 0.1, 0.1, ["ev_quarantine"]);
  assert.equal(novel.status, "OBSERVE");
  assert.equal(novel.mode, "NOVEL_THREAT_PROTOCOL");
});

test("adaptive immune attestation rejects doctrine-mutating responses", () => {
  assert.equal(AdaptiveImmune.immuneAdaptationAttestation("trace_immune", true, true, true, ["ev_immune"]).status, "IMMUNE_ADAPTATION_ATTESTED");
  assert.equal(AdaptiveImmune.immuneAdaptationAttestation("trace_immune", true, false, true, ["ev_immune"]).status, "IMMUNE_ADAPTATION_REJECTED");
});

test("attention allocation prioritizes survivability return per cognitive cost", () => {
  const result = Economy.attentionAllocation([
    { itemId: "cosmetic_explanation", survivabilityValue: 1, urgency: 1, cost: 5, evidenceIds: ["ev_attention_a"] },
    { itemId: "continuity_break", survivabilityValue: 9, urgency: 5, cost: 1, evidenceIds: ["ev_attention_b"] }
  ], ["ev_attention"]);
  assert.equal(result.status, "ATTENTION_ALLOCATED");
  assert.equal(result.ranked[0]?.itemId, "continuity_break");
});

test("explanation budget bounds causal explanation cost", () => {
  assert.equal(Economy.explanationBudget(200, 2, 10, ["ev_explain_budget"]).status, "EXPLANATION_AFFORDABLE");
  assert.equal(Economy.explanationBudget(1000, 5, 10, ["ev_explain_budget"]).status, "EXPLANATION_OVER_BUDGET");
});

test("governance cost flags excessive policy override conflict load", () => {
  assert.equal(Economy.governanceCost(2, 1, 1, 10, ["ev_gov_cost"]).status, "GOVERNANCE_COST_BOUNDED");
  assert.equal(Economy.governanceCost(5, 3, 3, 10, ["ev_gov_cost"]).status, "GOVERNANCE_COST_EXCESSIVE");
});

test("semantic economics detects poor operational value per meaning density", () => {
  assert.equal(Economy.semanticEconomics(8, 2, ["ev_sem_economy"]).status, "SEMANTIC_COST_EXCESSIVE");
  assert.equal(Economy.semanticEconomics(2, 2, ["ev_sem_economy"]).status, "SEMANTIC_VALUE_BALANCED");
});

test("survivability economics estimates continuity value per complexity cost", () => {
  assert.equal(Economy.survivabilityEconomics(10, 5, ["ev_survival_economy"]).status, "SURVIVABILITY_EFFICIENT");
  assert.equal(Economy.survivabilityEconomics(2, 5, ["ev_survival_economy"]).status, "SURVIVABILITY_INEFFICIENT");
});

test("cognitive budget rejects excessive attention governance and explanation cost", () => {
  assert.equal(Economy.cognitiveBudget(2, 2, 2, 10, ["ev_cognitive_budget"]).status, "COGNITIVE_BUDGET_OK");
  assert.equal(Economy.cognitiveBudget(5, 5, 5, 10, ["ev_cognitive_budget"]).status, "COGNITIVE_BUDGET_EXCEEDED");
});

test("operator cognition detects explanations beyond human interpretability", () => {
  assert.equal(Economy.operatorCognition(5, 3, 10, 5, ["ev_operator"]).status, "OPERATOR_INTERPRETABLE");
  assert.equal(Economy.operatorCognition(20, 3, 10, 5, ["ev_operator"]).status, "OPERATOR_OVERLOADED");
});

test("economy attestation requires budget and operator interpretability", () => {
  assert.equal(Economy.economyAttestation("trace_economy", true, true, true, ["ev_economy"]).status, "ECONOMY_ATTESTED");
  assert.equal(Economy.economyAttestation("trace_economy", false, true, true, ["ev_economy"]).status, "ECONOMY_REJECTED");
});

test("runtime ecology APIs fail closed without evidence", () => {
  assert.throws(() => Field.trustField([{ domainId: "a", trust: 1, incomingTrust: [], evidenceIds: ["ev"] }], []), /trust_field_requires_evidence/);
  assert.throws(() => AdaptiveImmune.epistemicAntibodies("sig", [], []), /epistemic_antibodies_require_evidence/);
  assert.throws(() => Economy.explanationBudget(1, 1, 1, []), /explanation_budget_requires_evidence/);
});

test("continuous adversarial runtime orchestrates bounded chaos", () => {
  const fakePacket = ContinuousAdversarial.fakePacketInjection("packet_a", false, true, ["ev_packet"]);
  const replay = ContinuousAdversarial.replayCorruption("digest", "digest", ["ev_replay_adv"]);
  const result = ContinuousAdversarial.adversarialOrchestrator([fakePacket, replay], 2, ["ev_adv"]);
  assert.equal(result.status, "SURVIVED");
  assert.equal(ContinuousAdversarial.chaosBudget(3, 2, ["ev_chaos"]).status, "CHAOS_EXCEEDED");
});

test("adversarial scenarios detect desync drift stale truth and pressure", () => {
  assert.equal(ContinuousAdversarial.websocketDesync(5, 1, ["ev_ws"]).status, "ESCALATED");
  assert.equal(ContinuousAdversarial.delayedAck(20, 10, ["ev_ack"]).status, "ESCALATED");
  assert.equal(ContinuousAdversarial.staleTruth(200, 50, ["ev_stale"]).status, "ESCALATED");
  assert.equal(ContinuousAdversarial.clockDrift(100, 10, ["ev_clock"]).status, "ESCALATED");
  assert.equal(ContinuousAdversarial.memoryPressure(1024, 512, ["ev_mem"]).status, "ESCALATED");
  assert.equal(ContinuousAdversarial.partialFailure(["a", "b"], 1, ["ev_partial"]).status, "ESCALATED");
});

test("formal invariants fail closed on unsafe operation", () => {
  const replay = FormalInvariants.replayInvariant("a", "b", ["ev_inv"]);
  const identity = FormalInvariants.identityInvariant(true, ["ev_inv"]);
  const enforced = FormalInvariants.invariantEnforcer([replay, identity], ["ev_inv"]);
  assert.equal(enforced.status, "HALT_UNSAFE_OPERATION");
  assert.deepEqual(enforced.violated, ["replay_consistency"]);
  assert.equal(FormalInvariants.temporalMonotonicity(2, 1, ["ev_time"]).status, "VIOLATED");
  assert.equal(FormalInvariants.boundedRecursion(4, 3, ["ev_rec"]).status, "VIOLATED");
});

test("bounded adaptation sandbox blocks unsafe promotion", () => {
  assert.equal(Adaptation.adaptationSandbox(true, true, ["ev_adapt"]).status, "SANDBOX_READY");
  assert.equal(Adaptation.mutationLimits(4, 2, ["ev_adapt"]).status, "MUTATION_EXCEEDED");
  assert.equal(Adaptation.rollbackHorizon(1, 2, ["ev_adapt"]).status, "ROLLBACK_UNSAFE");
  assert.equal(Adaptation.constitutionalBoundary(true, true, ["ev_adapt"]).status, "BOUNDARY_VIOLATED");
  assert.equal(Adaptation.survivabilityThreshold(0.5, 0.8, ["ev_adapt"]).status, "PROMOTION_BLOCKED");
  assert.equal(Adaptation.adaptationQuarantine(true, ["ev_adapt"]).status, "QUARANTINED");
});

test("self-doubt detects unreliable epistemic state and safe-mode need", () => {
  assert.equal(SelfDoubt.doubtConfidenceCollapse(0.2, 0.5, ["ev_doubt"]).status, "CONFIDENCE_COLLAPSED");
  assert.equal(SelfDoubt.doubtContradictionDensity(7, 10, 0.5, ["ev_doubt"]).status, "CONTRADICTION_UNSAFE");
  assert.equal(SelfDoubt.semanticInstability(0.8, 0.4, ["ev_doubt"]).status, "SEMANTIC_UNSTABLE");
  assert.equal(SelfDoubt.doubtTrustFragmentation(4, 2, ["ev_doubt"]).status, "TRUST_FRAGMENTED");
  assert.equal(SelfDoubt.selfConsistencyDecay(0.3, 0.9, 0.2, ["ev_doubt"]).status, "SELF_CONSISTENCY_DECAYED");
  assert.equal(SelfDoubt.epistemicReliability(0.7, 0.2, 0.2, ["ev_doubt"]).status, "EPISTEMIC_UNRELIABLE");
  assert.equal(SelfDoubt.uncertaintyThreshold(0.9, 0.5, ["ev_doubt"]).status, "SAFE_MODE_REQUIRED");
});

test("survivability scoring prioritizes continuity over performance", () => {
  assert.equal(Survivability.continuityScore(0.9, 0.8, 0.7, ["ev_score"]).status, "CONTINUITY_HEALTHY");
  assert.equal(Survivability.governanceHealth(0.8, 0.3, ["ev_score"]).status, "GOVERNANCE_DEGRADED");
  assert.equal(Survivability.replayHealth(1, 0, ["ev_score"]).status, "REPLAY_HEALTHY");
  assert.equal(Survivability.epistemicHealth(0.8, 0.1, ["ev_score"]).status, "EPISTEMIC_HEALTHY");
  assert.equal(Survivability.survivabilityScore(0.9, 0.9, 0.9, 0.9, 0.1, 0.1, ["ev_score"]).status, "SURVIVABLE");
});

test("operator cognition protection bounds alert load and escalation", () => {
  assert.equal(OperatorProtection.operatorCognitiveLoad(4, 4, 10, ["ev_operator_protect"]).status, "LOAD_EXCESSIVE");
  assert.equal(OperatorProtection.alertPrioritization([
    { alertId: "low", severity: 1, survivabilityImpact: 1, evidenceIds: ["ev_low"] },
    { alertId: "high", severity: 5, survivabilityImpact: 5, evidenceIds: ["ev_high"] }
  ], ["ev_alerts"]).ranked[0]?.alertId, "high");
  assert.equal(OperatorProtection.explainabilityCompression(10, 4, true, ["ev_compress_op"]).status, "EXPLANATION_COMPRESSED");
  assert.equal(OperatorProtection.governanceEscalation(5, 3, ["ev_escalate"]).status, "ESCALATE_TO_OPERATOR");
  assert.equal(OperatorProtection.operatorFatigue(10, 3, ["ev_fatigue"]).status, "FATIGUE_RISK");
});

test("entropy controls detect slow survivability degradation", () => {
  assert.equal(EntropyControl.memoryFragmentation(5, 2, ["ev_entropy"]).status, "MEMORY_FRAGMENTED");
  assert.equal(EntropyControl.entropyGovernanceDrift(0.8, 0.5, ["ev_entropy"]).status, "GOVERNANCE_DRIFTING");
  assert.equal(EntropyControl.identityErosion(0.7, 0.3, ["ev_entropy"]).status, "IDENTITY_ERODING");
  assert.equal(EntropyControl.semanticInflation(10, 2, ["ev_entropy"]).status, "SEMANTIC_INFLATION");
  assert.equal(EntropyControl.evidenceExplosion(100, 20, ["ev_entropy"]).status, "EVIDENCE_EXPLOSION");
  assert.equal(EntropyControl.complexityCreep(20, 10, 5, ["ev_entropy"]).status, "COMPLEXITY_CREEP");
  assert.equal(EntropyControl.entropyBudget([2, 3, 4], 5, ["ev_entropy"]).status, "ENTROPY_BUDGET_EXCEEDED");
});

test("long-horizon replay validation checks continuity governance semantics identity and time", () => {
  assert.equal(ReplayValidation.longHorizonReplay(1_000_000, 0, ["ev_long"]).status, "LONG_HORIZON_REPLAY_VALID");
  assert.equal(ReplayValidation.continuityValidation(true, false, ["ev_long"]).status, "CONTINUITY_INVALID");
  assert.equal(ReplayValidation.governanceReplay(true, ["ev_long"]).status, "GOVERNANCE_REPLAY_VALID");
  assert.equal(ReplayValidation.semanticReplay(false, ["ev_long"]).status, "SEMANTIC_REPLAY_INVALID");
  assert.equal(ReplayValidation.identityReplay(true, ["ev_long"]).status, "IDENTITY_REPLAY_VALID");
  assert.equal(ReplayValidation.replayTemporalValidation(true, ["ev_long"]).status, "TEMPORAL_REPLAY_VALID");
});

test("degradation orchestration sacrifices capability to preserve continuity", () => {
  assert.deepEqual(Degradation.capabilitySacrifice(["fast_exec", "safe_halt"], ["safe_halt"], ["ev_degrade"]).sacrificed, ["fast_exec"]);
  assert.equal(Degradation.degradationSafeMode(true, ["ev_degrade"]).status, "ENTER_SAFE_MODE");
  assert.equal(Degradation.cognitionReduction(true, ["ev_degrade"]).status, "REDUCE_COGNITION");
  assert.equal(Degradation.governanceFreeze(true, ["ev_degrade"]).status, "FREEZE_GOVERNANCE_MUTATION");
  assert.equal(Degradation.adaptiveDisable(true, ["ev_degrade"]).status, "DISABLE_ADAPTATION");
  assert.deepEqual(Degradation.degradationOrchestrator(["ENTER_SAFE_MODE", "DISABLE_ADAPTATION"], ["ev_degrade"]).order, ["DISABLE_ADAPTATION", "ENTER_SAFE_MODE"]);
});

test("survivability certification fails if any proof domain fails", () => {
  const invariant = Certification.invariantProof(true, ["ev_cert"]);
  const replay = Certification.replayProof(true, ["ev_cert"]);
  const governance = Certification.certificationGovernanceProof(false, ["ev_cert"]);
  const operational = Certification.operationalProof(true, true, true, true, ["ev_cert"]);
  const certified = Certification.survivabilityCertifier([invariant, replay, governance, operational], ["ev_cert"]);
  assert.equal(certified.status, "SURVIVABILITY_CERTIFICATION_FAILED");
  assert.deepEqual(certified.failed, ["governance"]);
  const audit = new Certification.CertificationAudit();
  assert.equal(audit.append("replay", "PROVEN", ["ev_cert"]).seq, 1);
  assert.equal(Certification.runtimeAttestation("trace_runtime", false, ["ev_cert"]).status, "RUNTIME_REJECTED");
});

test("validation era APIs fail closed without evidence", () => {
  assert.throws(() => ContinuousAdversarial.chaosBudget(1, 1, []), /chaos_budget_requires_evidence/);
  assert.throws(() => FormalInvariants.invariantAttestation("trace", true, []), /invariant_attestation_requires_evidence/);
  assert.throws(() => Adaptation.adaptationAttestation("trace", true, true, []), /adaptation_attestation_requires_evidence/);
  assert.throws(() => SelfDoubt.doubtAttestation("trace", true, []), /doubt_attestation_requires_evidence/);
  assert.throws(() => Survivability.survivabilityAttestation("trace", true, []), /survivability_attestation_requires_evidence/);
  assert.throws(() => EntropyControl.entropyAttestation("trace", true, []), /entropy_attestation_requires_evidence/);
  assert.throws(() => ReplayValidation.replayValidationAttestation("trace", true, []), /replay_validation_attestation_requires_evidence/);
  assert.throws(() => Degradation.degradationAttestation("trace", true, []), /degradation_attestation_requires_evidence/);
});

test("live chaos loop preserves deterministic bounded pressure schedule", () => {
  const result = LivePressure.liveChaosLoop([
    { seq: 2, scenarioId: "latency_spike", severity: 2, evidenceIds: ["ev_pressure_b"] },
    { seq: 1, scenarioId: "packet_corruption", severity: 1, evidenceIds: ["ev_pressure_a"] }
  ], 2, ["ev_pressure"]);
  assert.equal(result.status, "CHAOS_LOOP_BOUNDED");
  assert.equal(result.replaySafe, true);
  assert.deepEqual(result.schedule, ["packet_corruption", "latency_spike"]);
});

test("live pressure detects entropy operator collapse and unbounded divergence", () => {
  assert.equal(LivePressure.entropyAccelerator(2, 2, 2, 2, 5, ["ev_entropy_pressure"]).status, "ENTROPY_ACCELERATION_UNSAFE");
  assert.equal(LivePressure.operatorCollapse(1, 1, 1, 1, 3, ["ev_operator_pressure"]).status, "OPERATOR_COLLAPSE_RISK");
  assert.equal(LivePressure.pressureDivergenceDetector(5, 2, ["ev_divergence"]).status, "DIVERGENCE_UNBOUNDED");
});

test("replay survivability accepts bounded divergence under degradation", () => {
  const survived = LivePressure.replaySurvivability("digest_a", "digest_b", 1, 2, ["ev_replay_pressure"]);
  assert.equal(survived.status, "REPLAY_SURVIVED");

  const failed = LivePressure.replaySurvivability("digest_a", "digest_b", 5, 2, ["ev_replay_pressure"]);
  assert.equal(failed.status, "REPLAY_UNSURVIVABLE");
});

test("pressure orchestrator and degradation monitor recommend controlled degradation", () => {
  const orchestrated = LivePressure.pressureOrchestrator([
    { signalId: "entropy", status: "UNSAFE", evidenceIds: ["ev_entropy_signal"] },
    { signalId: "replay", status: "BOUNDED", evidenceIds: ["ev_replay_signal"] }
  ], ["ev_orchestrate"]);
  assert.equal(orchestrated.status, "DEGRADATION_REQUIRED");
  assert.deepEqual(orchestrated.unsafe, ["entropy"]);

  assert.equal(LivePressure.degradationMonitor(5, 2, 1, ["ev_monitor"]).status, "DEGRADATION_UNSTABLE");
});

test("survivability recorder is append-only and pressure attestation is bounded", () => {
  const recorder = new LivePressure.SurvivabilityRecorder();
  assert.deepEqual(recorder.append(1000, 0.8, ["ev_record"]), {
    seq: 1,
    durationMs: 1000,
    survivabilityScore: 0.8,
    evidenceIds: ["ev_record"]
  });
  assert.equal(recorder.append(2000, 0.7, ["ev_record_2"]).seq, 2);
  assert.equal(LivePressure.pressureAttestation("trace_pressure", true, true, true, ["ev_attest"]).status, "PRESSURE_ATTESTED");
  assert.equal(LivePressure.pressureAttestation("trace_pressure", true, false, true, ["ev_attest"]).status, "PRESSURE_REJECTED");
});

test("minimal kernel preserves irreducible continuity primitives", () => {
  assert.equal(MinimalKernel.minimalKernelIdentity("runtime_a", "hash_a", ["ev_kernel_min"]).status, "KERNEL_IDENTITY_REPLAYABLE");
  assert.equal(MinimalKernel.minimalKernelInvariants(MinimalKernel.MINIMAL_KERNEL_INVARIANTS, ["ev_kernel_min"]).status, "KERNEL_COMPLETE");
  assert.equal(MinimalKernel.minimalKernelCausality(1, 2, ["ev_kernel_min"]).status, "KERNEL_CAUSALITY_MONOTONIC");
  assert.equal(MinimalKernel.minimalKernelTruth(true, true, ["ev_kernel_min"]).status, "KERNEL_TRUTH_USABLE");
});

test("minimal kernel rejects unsafe degradation recovery and continuity", () => {
  assert.equal(MinimalKernel.minimalKernelDegradation(true, false, ["ev_kernel_min"]).status, "KERNEL_DEGRADATION_UNSAFE");
  assert.equal(MinimalKernel.minimalKernelRecovery(false, true, ["ev_kernel_min"]).status, "KERNEL_RECOVERY_UNSAFE");
  assert.equal(MinimalKernel.minimalKernelContinuity(true, true, false, true, ["ev_kernel_min"]).status, "KERNEL_CONTINUITY_BROKEN");
  assert.equal(MinimalKernel.minimalKernelAttestation("trace_kernel_min", true, false, ["ev_kernel_min"]).status, "MINIMAL_KERNEL_REJECTED");
});

test("minimal kernel reports missing core invariants", () => {
  const result = MinimalKernel.minimalKernelInvariants(["identity_continuity"], ["ev_kernel_min"]);
  assert.equal(result.status, "KERNEL_INCOMPLETE");
  assert.equal(result.missing.includes("recovery_orchestration"), true);
});

test("live pressure and minimal kernel APIs fail closed without evidence", () => {
  assert.throws(() => LivePressure.entropyAccelerator(1, 1, 1, 1, 10, []), /entropy_accelerator_requires_evidence/);
  assert.throws(() => LivePressure.pressureAttestation("trace", true, true, true, []), /pressure_attestation_requires_evidence/);
  assert.throws(() => MinimalKernel.minimalKernelIdentity("runtime", "hash", []), /minimal_kernel_identity_requires_evidence/);
  assert.throws(() => MinimalKernel.minimalKernelAttestation("trace", true, true, []), /minimal_kernel_attestation_requires_evidence/);
});

test("semantic compression pass detects ontology overlap and duplicates", () => {
  const overlap = SemanticCompressionPass.ontologyOverlap([
    { conceptId: "trust_fracture", role: "pressure", primitives: ["coherence"], evidenceIds: ["ev_overlap_a"] },
    { conceptId: "coherence_decay", role: "pressure", primitives: ["coherence"], evidenceIds: ["ev_overlap_b"] }
  ], ["ev_overlap"]);
  assert.equal(overlap.status, "OVERLAP_FOUND");

  const duplicates = SemanticCompressionPass.duplicateDetector([
    { id: "semantic_economics", semanticSignature: "budget", evidenceIds: ["ev_dup_a"] },
    { id: "cognitive_budget", semanticSignature: "budget", evidenceIds: ["ev_dup_b"] }
  ], ["ev_dup"]);
  assert.equal(duplicates.status, "DUPLICATES_FOUND");
});

test("semantic compression pass blocks unsafe concept merges", () => {
  assert.equal(SemanticCompressionPass.conceptMerge(["a", "b"], "a", true, true, true, ["ev_merge"]).status, "MERGE_RECOMMENDED");
  assert.equal(SemanticCompressionPass.conceptMerge(["a", "b"], "a", true, false, true, ["ev_merge"]).status, "MERGE_BLOCKED");
  assert.equal(SemanticCompressionPass.semanticSurfaceArea(60, 5, 4, 10, ["ev_surface_pass"]).status, "SURFACE_AREA_EXCESSIVE");
});

test("semantic compression plan preserves retained meaning and auditability", () => {
  const plan = SemanticCompressionPass.compressionPlan(["merge_governance_stress"], ["replay", "identity"], ["test_replay"], ["ev_plan"]);
  assert.equal(plan.status, "COMPRESSION_RECOMMENDED");
  assert.equal(plan.destructive, false);
  assert.equal(SemanticCompressionPass.retainedMeaning(["identity", "replay"], ["identity"], ["ev_meaning"]).status, "MEANING_LOSS");
  assert.equal(SemanticCompressionPass.removalJustification("semantic_alias", "duplicate role", true, true, ["ev_remove"]).status, "REMOVAL_JUSTIFIED");
  assert.equal(SemanticCompressionPass.compressionPassAttestation("trace_compress", true, true, true, ["ev_attest"]).status, "COMPRESSION_PASS_ATTESTED");
});

test("cold-start recovery rebuilds runtime from append-only evidence", () => {
  assert.equal(ColdStart.evidenceBootstrap(10, 5, ["ev_boot"]).status, "EVIDENCE_BOOTSTRAPPED");
  assert.equal(ColdStart.identityRehydration(true, true, ["ev_identity_rehydrate"]).status, "IDENTITY_REHYDRATED");
  assert.equal(ColdStart.timelineRecovery(true, 5, ["ev_timeline"]).status, "TIMELINE_RECOVERED");
  assert.equal(ColdStart.truthReplay(3, true, ["ev_truth_replay"]).status, "TRUTH_REPLAYED");
  assert.equal(ColdStart.governanceRestore(true, true, ["ev_governance_restore"]).status, "GOVERNANCE_RESTORED");
  assert.equal(ColdStart.operationalRealityRehydrate(true, true, ["ev_reality_rehydrate"]).status, "OPERATIONAL_REALITY_REHYDRATED");
});

test("cold-start fails to constitutional failure when kernel cannot rebuild", () => {
  const rebuild = ColdStart.kernelRebuild(true, true, false, true, true, ["ev_kernel_rebuild"]);
  assert.equal(rebuild.status, "KERNEL_REBUILD_FAILED");
  const recovery = ColdStart.coldStartRecovery([
    { checkId: "identity", passed: true, evidenceIds: ["ev_identity"] },
    { checkId: "truth", passed: false, evidenceIds: ["ev_truth"] }
  ], ["ev_cold_start"]);
  assert.equal(recovery.status, "CONSTITUTIONAL_FAILURE_REQUIRED");
  assert.deepEqual(recovery.failed, ["truth"]);
  assert.equal(ColdStart.coldStartAttestation("trace_cold", true, true, false, ["ev_cold_attest"]).status, "COLD_START_REJECTED");
});

test("time horizon validates long-duration bounded drift and growth", () => {
  assert.equal(TimeHorizon.longHorizonRunner(10_000, 1_000, true, ["ev_horizon"]).status, "HORIZON_COMPLETED");
  assert.equal(TimeHorizon.horizonDriftMonitor(0.1, 0.2, ["ev_horizon"]).status, "DRIFT_BOUNDED");
  assert.equal(TimeHorizon.semanticInflationMonitor(10, 3, ["ev_horizon"]).status, "SEMANTIC_INFLATION_DETECTED");
  assert.equal(TimeHorizon.governanceRot(0.7, 0.2, ["ev_horizon"]).status, "GOVERNANCE_ROT_DETECTED");
});

test("time horizon detects memory replay and evidence explosions", () => {
  assert.equal(TimeHorizon.memorySaturation(100, 50, ["ev_horizon_growth"]).status, "MEMORY_SATURATED");
  assert.equal(TimeHorizon.replayExplosion(100, 50, ["ev_horizon_growth"]).status, "REPLAY_EXPLOSION");
  assert.equal(TimeHorizon.evidenceGrowth(100, 50, ["ev_horizon_growth"]).status, "EVIDENCE_GROWTH_UNBOUNDED");
  assert.equal(TimeHorizon.longHorizonScore([0.8, 0.7, 0.9], ["ev_horizon_score"]).status, "LONG_HORIZON_STABLE");
  assert.equal(TimeHorizon.horizonAttestation("trace_horizon", true, true, false, ["ev_horizon_attest"]).status, "HORIZON_REJECTED");
});

test("compression cold-start and horizon APIs fail closed without evidence", () => {
  assert.throws(() => SemanticCompressionPass.ontologyOverlap([{ conceptId: "a", role: "r", primitives: [], evidenceIds: ["ev"] }], []), /ontology_overlap_requires_evidence/);
  assert.throws(() => ColdStart.evidenceBootstrap(1, 1, []), /evidence_bootstrap_requires_evidence/);
  assert.throws(() => TimeHorizon.longHorizonRunner(1, 1, true, []), /long_horizon_runner_requires_evidence/);
});

test("runtime profiling detects bounded growth and amplification failures", () => {
  assert.equal(Profiling.memoryGrowth([100, 120, 140], 50, ["ev_profile"]).status, "MEMORY_GROWTH_BOUNDED");
  assert.equal(Profiling.memoryGrowth([100, 220], 50, ["ev_profile"]).status, "MEMORY_SATURATION_RISK");
  assert.equal(Profiling.replayGrowth(10, 40, 3, ["ev_profile"]).status, "REPLAY_EXPLOSION_DETECTED");
  assert.equal(Profiling.queuePressure(91, 100, 0.9, ["ev_profile"]).status, "QUEUE_INSTABILITY_DETECTED");
  assert.equal(Profiling.serializationCost(1000, 10, 80, ["ev_profile"]).status, "SERIALIZATION_AMPLIFICATION_DETECTED");
  assert.equal(Profiling.gcPressure(20, 100, 0.1, ["ev_profile"]).status, "GC_PRESSURE_UNSTABLE");
  assert.equal(Profiling.eventAmplification(10, 50, 4, ["ev_profile"]).status, "EVENT_STORM_DETECTED");
  assert.equal(Profiling.recoveryLatency(5000, 1000, true, ["ev_profile"]).status, "COLD_START_DEGRADATION_DETECTED");
  assert.equal(Profiling.profilingAttestation("trace_profile", true, true, true, ["ev_profile"]).status, "PROFILING_ATTESTED");
});

test("replay certification preserves divergence and rejects inconsistent degradation", () => {
  assert.equal(ReplayCertification.deterministicReplay("in", "out", "out", ["ev_replay_cert"]).status, "DETERMINISTIC_REPLAY_CONFIRMED");
  const divergence = ReplayCertification.replayDivergence("expected", "actual", ["lineage_a"], ["contradiction_a"], ["ev_replay_cert"]);
  assert.equal(divergence.status, "DIVERGENCE_PRESERVED_FAIL_CLOSED");
  assert.deepEqual(divergence.contradictionIds, ["contradiction_a"]);
  assert.equal(ReplayCertification.governanceConsistency("gov_a", "gov_b", true, ["ev_replay_cert"]).status, "GOVERNANCE_INCONSISTENT_FAIL_CLOSED");
  assert.equal(ReplayCertification.realityConsistency("reality", "reality", true, ["ev_replay_cert"]).status, "REALITY_CONSISTENT");
  assert.equal(ReplayCertification.degradedReplay(true, true, false, true, ["ev_replay_cert"]).status, "DEGRADED_REPLAY_FAIL_CLOSED");
  assert.equal(ReplayCertification.replayCertification([{ checkId: "determinism", passed: true, evidenceIds: ["ev_det"] }], ["ev_replay_cert"]).status, "REPLAY_CERTIFIED");
  assert.equal(ReplayCertification.certificationAttestation("trace_cert", true, true, true, ["ev_replay_cert"]).status, "REPLAY_CERTIFICATION_ATTESTED");
});

test("minimal survivability keeps only irreducible live recovery state", () => {
  const kernel = MinimalSurvivability.irreducibleKernel(MinimalSurvivability.IRREDUCIBLE_KERNEL_PRIMITIVES, ["ev_min_survive"]);
  assert.equal(kernel.status, "IRREDUCIBLE_KERNEL_COMPLETE");
  assert.equal(MinimalSurvivability.continuityCore(true, true, true, true, ["ev_min_survive"]).status, "CONTINUITY_CORE_PRESERVED");
  assert.equal(MinimalSurvivability.essentialState(["identity", "replay"], ["analytics"], ["ev_min_survive"]).status, "ESSENTIAL_STATE_MINIMAL");
  assert.equal(MinimalSurvivability.recoverySeed("id", "timeline", "gov", "replay", ["ev_min_survive"]).status, "RECOVERY_SEED_READY");
  assert.equal(MinimalSurvivability.survivableState(7, 7, true, ["ev_min_survive"]).status, "STATE_SURVIVABLE");
  assert.equal(MinimalSurvivability.collapseThreshold(0.4, 0.7, ["ev_min_survive"]).status, "SURVIVAL_ONLY_REQUIRED");
  assert.equal(MinimalSurvivability.survivabilityKernelAttestation("trace_kernel_survive", true, true, true, ["ev_min_survive"]).status, "SURVIVABILITY_KERNEL_ATTESTED");
});

test("deployment envelope fails closed and preserves override authority", () => {
  assert.equal(Deployment.deploymentProfile("SHADOW", true, true, ["ev_deploy"]).status, "DEPLOYMENT_PROFILE_ACCEPTED");
  assert.equal(Deployment.capitalEnvelope("PAPER", 10, 100, ["ev_deploy"]).status, "CAPITAL_ENVELOPE_REJECTED");
  assert.equal(Deployment.deploymentSafeMode(true, true, true, ["ev_deploy"]).status, "SAFE_MODE_READY");
  assert.equal(Deployment.venueHealth(200, 100, false, false, ["ev_deploy"]).status, "VENUE_UNSAFE");
  assert.equal(Deployment.operatorOverride(true, true, true, ["ev_deploy"]).status, "OPERATOR_OVERRIDE_AVAILABLE");
  const gated = Deployment.deploymentGating("LIVE", [
    { gateId: "venue", passed: false, evidenceIds: ["ev_venue"] },
    { gateId: "operator_override", passed: true, evidenceIds: ["ev_override"] }
  ], ["ev_deploy"]);
  assert.equal(gated.status, "DEPLOYMENT_FAIL_CLOSED");
  assert.equal(gated.gatedMode, "SURVIVAL_ONLY");
  assert.equal(Deployment.deploymentAttestation("trace_deploy", true, true, true, ["ev_deploy"]).status, "DEPLOYMENT_ATTESTED");
});

test("burn-in simulations are deterministic and degrade instead of mutating runtime", () => {
  assert.equal(BurnIn.websocketReconnectStorms(4, 3, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.replayFloods(100, 200, ["ev_burn"]).status, "BURN_IN_CONTAINED");
  assert.equal(BurnIn.staleFeedBursts(3, 2, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.delayedAcks(50, 100, ["ev_burn"]).status, "BURN_IN_CONTAINED");
  assert.equal(BurnIn.exchangeDesync(5, 2, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.duplicateFills(1, 0, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.packetLoss(1, 2, ["ev_burn"]).status, "BURN_IN_CONTAINED");
  assert.equal(BurnIn.burnInClockDrift(1000, 100, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.queueAmplification(10, 60, 5, ["ev_burn"]).status, "BURN_IN_DEGRADED");
  assert.equal(BurnIn.burnInMemoryPressure(100, 100, ["ev_burn"]).status, "BURN_IN_CONTAINED");
});

test("deployment-readiness modules fail closed without evidence", () => {
  assert.throws(() => Profiling.memoryGrowth([1, 2], 1, []), /memory_growth_requires_evidence/);
  assert.throws(() => ReplayCertification.deterministicReplay("in", "a", "a", []), /deterministic_replay_requires_evidence/);
  assert.throws(() => MinimalSurvivability.irreducibleKernel([], []), /irreducible_kernel_requires_evidence/);
  assert.throws(() => Deployment.deploymentProfile("SHADOW", true, true, []), /deployment_profile_requires_evidence/);
  assert.throws(() => BurnIn.replayFloods(1, 1, []), /replay_floods_requires_evidence/);
});

test("ontology hygiene detects overlap without autonomous merge", () => {
  const overlap = OntologyHygiene.conceptOverlap([
    { conceptId: "TRUST", primitives: ["source_reliability", "replay_stability", "temporal_integrity"], evidenceIds: ["ev_trust"] },
    { conceptId: "FEED_CONFIDENCE", primitives: ["source_reliability", "replay_stability", "latency_bound"], evidenceIds: ["ev_feed"] }
  ], 0.5, ["ev_overlap"]);
  assert.equal(overlap.status, "CONCEPT_OVERLAP_DETECTED");
  assert.equal(overlap.recommendationOnly, true);
  assert.equal(overlap.findings[0]?.overlapRatio, 0.5);
});

test("ontology hygiene detects semantic drift in protected domains", () => {
  const drift = OntologyHygiene.semanticDrift(
    "TRUST",
    ["source_reliability", "replay_stability", "temporal_integrity"],
    ["source_reliability", "operational_usefulness"],
    0.5,
    ["ev_drift"]
  );
  assert.equal(drift.status, "SEMANTIC_DRIFT_DETECTED");
  assert.deepEqual(drift.missingTerms, ["replay_stability", "temporal_integrity"]);
});

test("ontology hygiene reports pressure and doctrine conflicts as recommendations only", () => {
  assert.equal(OntologyHygiene.ontologyPressure(120, 100, 6, 5, 0.4, 0.3, ["ev_pressure"]).status, "ONTOLOGY_PRESSURE_DETECTED");
  const conflict = OntologyHygiene.doctrineConflict(
    "TRUST",
    ["source_reliability", "replay_stability", "temporal_integrity"],
    ["source_reliability", "operational_usefulness"],
    ["ev_conflict"]
  );
  assert.equal(conflict.status, "DOCTRINE_CONFLICT_DETECTED");
  assert.equal(conflict.mutationPerformed, false);
});

test("ontology merge candidates require complete approval chain and never mutate", () => {
  const approvals: OntologyHygiene.SemanticApprovalChain = {
    replaySafeValidation: true,
    doctrineSafeValidation: true,
    governanceApproval: true,
    operatorApproval: true,
    semanticAttestation: true,
    replayCompatibilityVerification: true
  };
  const candidate = OntologyHygiene.mergeCandidate("TRUST", "FEED_CONFIDENCE", 0.81, "medium", "medium", approvals, ["ev_candidate"]);
  assert.equal(candidate.status, "MERGE_CANDIDATE_RECOMMENDED_ONLY");
  assert.equal(candidate.mutationPerformed, false);

  const blocked = OntologyHygiene.mergeCandidate("TRUST", "UTILITY", 0.9, "medium", "high", approvals, ["ev_candidate_blocked"]);
  assert.equal(blocked.status, "MERGE_CANDIDATE_BLOCKED");
});

test("semantic attestation requires governance and operator approval for review readiness", () => {
  const approvals: OntologyHygiene.SemanticApprovalChain = {
    replaySafeValidation: true,
    doctrineSafeValidation: true,
    governanceApproval: true,
    operatorApproval: true,
    semanticAttestation: true,
    replayCompatibilityVerification: true
  };
  const attested = OntologyHygiene.semanticAttestation("trace_semantic", approvals, true, true, true, [
    { seq: 1, action: "RECOMMEND", subject: "TRUST_FEED_CONFIDENCE", evidenceIds: ["ev_audit"] }
  ], ["ev_attest_semantic"]);
  assert.equal(attested.status, "SEMANTIC_ATTESTATION_REVIEW_READY");
  assert.equal(attested.recommendationOnly, true);
  assert.equal(attested.mutationPerformed, false);

  const rejected = OntologyHygiene.semanticAttestation("trace_semantic", { ...approvals, operatorApproval: false }, true, true, true, [
    { seq: 1, action: "BLOCK", subject: "TRUST_UTILITY", evidenceIds: ["ev_audit_reject"] }
  ], ["ev_attest_reject"]);
  assert.equal(rejected.status, "SEMANTIC_ATTESTATION_REJECTED");
});

test("ontology hygiene APIs fail closed without evidence", () => {
  const approvals: OntologyHygiene.SemanticApprovalChain = {
    replaySafeValidation: true,
    doctrineSafeValidation: true,
    governanceApproval: true,
    operatorApproval: true,
    semanticAttestation: true,
    replayCompatibilityVerification: true
  };
  assert.throws(() => OntologyHygiene.conceptOverlap([], 0.5, []), /concept_overlap_requires_evidence/);
  assert.throws(() => OntologyHygiene.semanticDrift("TRUST", ["source"], ["source"], 0.5, []), /semantic_drift_requires_evidence/);
  assert.throws(() => OntologyHygiene.mergeCandidate("A", "B", 0.8, "low", "low", approvals, []), /merge_candidate_requires_evidence/);
  assert.throws(() => OntologyHygiene.semanticAttestation("trace", approvals, true, true, true, [], ["ev"]), /semantic_attestation_requires_evidence/);
});

test("kernel core extracts survivability kernel and classifies module necessity deterministically", () => {
  const checks: KernelCore.KernelInvariantCheck[] = KernelCore.KERNEL_INVARIANTS.map((invariant) => ({ invariant, preserved: true, evidenceIds: [`ev_${invariant}`] }));
  const extracted = KernelCore.kernelCore([
    {
      moduleId: "identity-kernel",
      preserves: [...KernelCore.KERNEL_INVARIANTS],
      runtimeSurvivesWithoutModule: false,
      evidenceIds: ["ev_identity_kernel"]
    },
    {
      moduleId: "decorative-observer",
      preserves: ["explainability"],
      runtimeSurvivesWithoutModule: true,
      evidenceIds: ["ev_observer"]
    },
    {
      moduleId: "duplicate-replay-view",
      preserves: ["replay_integrity"],
      replacementModules: ["replay-engine"],
      runtimeSurvivesWithoutModule: true,
      evidenceIds: ["ev_duplicate"]
    }
  ], checks, ["ev_kernel"]);

  assert.equal(extracted.status, "SURVIVABILITY_KERNEL_EXTRACTED");
  assert.equal(extracted.automaticDeletionAllowed, false);
  assert.deepEqual(extracted.classifications.map((item) => [item.moduleId, item.classification]), [
    ["decorative-observer", "REMOVAL_CANDIDATE"],
    ["duplicate-replay-view", "REDUNDANT"],
    ["identity-kernel", "ESSENTIAL"]
  ]);

  const removal = KernelCore.removalCandidate("decorative-observer", true, [], ["ev_remove"]);
  assert.equal(removal.status, "REMOVAL_CANDIDATE_RECOMMENDED_ONLY");
  assert.equal(removal.automaticDeletionAllowed, false);
});

test("kernel core preserves identity replay governance truth recovery and degradation invariants", () => {
  assert.equal(KernelCore.kernelIdentity(["id_a", "id_b"], "id_b", ["ev_identity"]).status, "IDENTITY_CONTINUITY_PRESERVED");
  assert.equal(KernelCore.kernelReplay("hash", "hash", true, ["ev_replay"]).status, "REPLAY_INTEGRITY_PRESERVED");
  assert.equal(KernelCore.kernelGovernance(["no_delete", "no_mutate"], ["no_mutate", "no_delete"], ["ev_gov"]).status, "GOVERNANCE_INVARIANTS_PRESERVED");
  assert.equal(KernelCore.kernelTruth(["truth_a", "truth_b"], ["truth_a", "truth_b"], ["ev_truth"]).status, "OPERATIONAL_TRUTH_PRESERVED");
  assert.equal(KernelCore.kernelRecovery(["freeze", "rehydrate"], ["freeze", "rehydrate", "resume"], ["ev_recovery"]).status, "RECOVERY_ORDERING_PRESERVED");
  assert.equal(KernelCore.kernelDegradation(["safe_mode", "read_only"], ["safe_mode"], ["ev_degrade"]).status, "DEGRADATION_DOCTRINE_PRESERVED");
  assert.equal(KernelCore.kernelAttestation("trace_kernel", "KERNEL_INVARIANTS_PRESERVED", [
    { decisionId: "d1", decision: "classify", evidenceIds: ["ev_d1"] }
  ], ["ev_attest"]).status, "KERNEL_ATTESTED");
});

test("semantic surface budget detects duplication overlap inflation and synonym conflicts without mutation", () => {
  assert.equal(SemanticSurface.semanticSurfaceBudget(12, 10, 5, 10, ["ev_budget"]).status, "SEMANTIC_SURFACE_EXCEEDED");

  const duplication = SemanticSurface.conceptDuplication([
    { conceptId: "TRUST", signature: "source+replay", evidenceIds: ["ev_trust"] },
    { conceptId: "FEED_CONFIDENCE", signature: "source+replay", evidenceIds: ["ev_feed"] }
  ], ["ev_dup"]);
  assert.equal(duplication.status, "CONCEPT_DUPLICATION_DETECTED");
  assert.equal(duplication.recommendationOnly, true);

  const synonyms = SemanticSurface.governanceSynonymExplosion([
    { term: "override", implication: "operator_can_change", evidenceIds: ["ev_override"] },
    { term: "exception", implication: "rule_can_be_bypassed", evidenceIds: ["ev_exception"] }
  ], [["override", "exception"]], ["ev_syn"]);
  assert.equal(synonyms.status, "GOVERNANCE_SYNONYM_CONFLICTS_DETECTED");
  assert.equal(synonyms.doctrineMutationAllowed, false);

  assert.equal(SemanticSurface.overlappingAbstractions([
    { abstractionId: "a", responsibilities: ["replay", "truth"], evidenceIds: ["ev_a"] },
    { abstractionId: "b", responsibilities: ["replay", "truth", "governance"], evidenceIds: ["ev_b"] }
  ], 0.5, ["ev_overlap"]).status, "OVERLAPPING_ABSTRACTIONS_DETECTED");
  assert.equal(SemanticSurface.semanticInflation(10, 15, 0.2, ["ev_inflate"]).status, "SEMANTIC_INFLATION_DETECTED");
});

test("semantic surface reduction remains approval-gated and retains protected semantics", () => {
  const plan = SemanticSurface.surfaceReductionPlan([
    { id: "duplicate_trust", severity: "high", evidenceIds: ["ev_finding"] }
  ], ["ev_plan"]);
  assert.equal(plan.status, "SURFACE_REDUCTION_RECOMMENDED_ONLY");
  assert.equal(plan.autonomousMergeAllowed, false);
  assert.equal(plan.governanceApprovalRequired, true);

  assert.equal(SemanticSurface.retainedSemantics(["identity", "replay"], ["identity", "replay"], ["ev_retained"]).status, "REQUIRED_SEMANTICS_RETAINED");
  assert.equal(SemanticSurface.reductionAttestation("trace_semantic_surface", true, true, ["ev_reduce"]).status, "REDUCTION_ATTESTED_REVIEW_ONLY");
});

test("replay compression certifies only causal meaning preserving compression", () => {
  const boundary = ReplayCompression.compressionBoundary([...ReplayCompression.REPLAY_COMPRESSION_BOUNDARY], ["ev_boundary"]);
  const causal = ReplayCompression.causalMeaningPreservation(["a->b", "b->c"], ["a->b", "b->c"], ["ev_causal"]);
  const equivalent = ReplayCompression.replayEquivalence("digest", "digest", true, ["ev_equiv"]);
  const certified = ReplayCompression.replayCompressionCertifier(boundary.status, causal.status, equivalent.status, false, ["ev_cert"]);

  assert.equal(boundary.status, "COMPRESSION_BOUNDARY_PRESERVED");
  assert.equal(causal.status, "CAUSAL_MEANING_PRESERVED");
  assert.equal(certified.status, "REPLAY_COMPRESSION_CERTIFIED");
  assert.equal(certified.compressionApplied, false);
  assert.equal(ReplayCompression.compressedReplayProof("proof_1", true, true, true, ["ev_proof"]).status, "COMPRESSED_REPLAY_PROVEN");
  assert.equal(ReplayCompression.replayCompressionAttestation("trace_replay_compression", certified.status, true, ["ev_attest"]).status, "REPLAY_COMPRESSION_ATTESTED");
});

test("replay compression emits risk report when meaning would be lost", () => {
  const boundary = ReplayCompression.compressionBoundary(["causal_ordering"], ["ev_boundary_risk"]);
  const causal = ReplayCompression.causalMeaningPreservation(["a->b", "b->c"], ["a->b"], ["ev_causal_risk"]);
  const risk = ReplayCompression.replayRisk(boundary.missing, causal.missingEdges, true, ["ev_risk"]);
  const certified = ReplayCompression.replayCompressionCertifier(boundary.status, causal.status, "REPLAY_EQUIVALENT", true, ["ev_cert_risk"]);

  assert.equal(boundary.status, "COMPRESSION_BOUNDARY_BREACHED");
  assert.equal(causal.status, "CAUSAL_MEANING_LOST");
  assert.equal(risk.status, "REPLAY_COMPRESSION_RISK_REPORTED");
  assert.equal(certified.status, "REPLAY_COMPRESSION_REQUIRES_RISK_REPORT");
});

test("operational minimalism scores subsystem value against complexity and marks quarantine candidates", () => {
  const value = Minimalism.subsystemValue(2, 2, 2, 1, 1, ["ev_value"]);
  const cost = Minimalism.complexityCost(3, 3, 2, 2, ["ev_cost"]);
  const score = Minimalism.minimalismScore("semantic-fanout", value.score, cost.score, ["ev_score"]);
  const justification = Minimalism.existenceJustification("semantic-fanout", score.status, ["semantic_stability"], ["ev_justify"]);
  const quarantine = Minimalism.quarantineCandidate("semantic-fanout", justification.status === "EXISTENCE_JUSTIFIED", true, ["ev_quarantine"]);

  assert.equal(score.status, "SUBSYSTEM_SELF_WEIGHT_DETECTED");
  assert.equal(justification.status, "EXISTENCE_NOT_JUSTIFIED");
  assert.equal(quarantine.status, "QUARANTINE_CANDIDATE_REVIEW_REQUIRED");
  assert.equal(quarantine.automaticRemovalAllowed, false);
});

test("operational minimalism reports deterministic explainable scoring", () => {
  assert.equal(Minimalism.survivabilityValue(1, 1, 1, 1, ["ev_survive"]).score, 4);
  const report = Minimalism.operationalMinimalismReport([
    { subsystemId: "kernel", valueScore: 10, costScore: 3, evidenceIds: ["ev_kernel"] },
    { subsystemId: "ornamental-layer", valueScore: 1, costScore: 5, evidenceIds: ["ev_ornament"] }
  ], ["ev_report"]);
  assert.equal(report.status, "OPERATIONAL_SELF_WEIGHT_DETECTED");
  assert.deepEqual(report.quarantineCandidates, ["ornamental-layer"]);
  assert.equal(Minimalism.minimalismAttestation("trace_minimalism", true, true, false, ["ev_attest"]).status, "MINIMALISM_ATTESTED");
});

test("long-horizon simulation preserves 30-day 90-day and one-year stability when growth is bounded", () => {
  const input = {
    semanticDrift: 1,
    maxSemanticDrift: 2,
    replayEventsPerDay: 100,
    maxReplayEventsPerDay: 200,
    governanceRot: 1,
    maxGovernanceRot: 2,
    memoryGrowthPerDay: 3,
    maxMemoryGrowthPerDay: 4,
    ontologyGrowthPerDay: 0,
    maxOntologyGrowthPerDay: 1,
    identityContinuity: true,
    operationalTruthPreserved: true,
    recoveryCapabilityPreserved: true
  };

  assert.equal(LongHorizon.thirtyDayRun(input, ["ev_30"]).status, "LONG_HORIZON_SURVIVABLE");
  assert.equal(LongHorizon.ninetyDayRun(input, ["ev_90"]).days, 90);
  assert.equal(LongHorizon.oneYearRun(input, ["ev_year"]).days, 365);
});

test("long-horizon monitors detect semantic drift replay growth governance rot memory leaks and ontology inflation", () => {
  const semantic = LongHorizon.semanticDriftMonitor(3, 2, ["ev_semantic"]);
  const replay = LongHorizon.replayGrowthMonitor(300, 200, ["ev_replay"]);
  const governance = LongHorizon.governanceRotMonitor(3, 2, ["ev_governance"]);
  const memory = LongHorizon.memoryLeakMonitor(5, 4, ["ev_memory"]);
  const ontology = LongHorizon.ontologyInflationMonitor(2, 1, ["ev_ontology"]);

  assert.equal(semantic.status, "SEMANTIC_DRIFT_UNBOUNDED");
  assert.equal(replay.status, "REPLAY_GROWTH_UNBOUNDED");
  assert.equal(governance.status, "GOVERNANCE_ROT_DETECTED");
  assert.equal(memory.status, "MEMORY_LEAK_RISK_DETECTED");
  assert.equal(ontology.status, "ONTOLOGY_INFLATION_DETECTED");

  const report = LongHorizon.horizonSurvivabilityReport([
    { monitorId: "semantic", status: semantic.status, evidenceIds: ["ev_semantic"] },
    { monitorId: "replay", status: "REPLAY_GROWTH_BOUNDED", evidenceIds: ["ev_replay_ok"] }
  ], ["ev_report"]);
  assert.equal(report.status, "HORIZON_SURVIVABILITY_DEGRADED");
  assert.equal(LongHorizon.horizonAttestation("trace_horizon", report.status, 365, ["ev_attest"]).status, "HORIZON_ATTESTATION_REJECTED");
});

test("runtime crystallization APIs fail closed without evidence", () => {
  assert.throws(() => KernelCore.kernelIdentity(["id"], "id", []), /kernel_identity_requires_evidence/);
  assert.throws(() => SemanticSurface.semanticSurfaceBudget(1, 1, 1, 1, []), /semantic_surface_budget_requires_evidence/);
  assert.throws(() => ReplayCompression.compressionBoundary(["causal_ordering"], []), /compression_boundary_requires_evidence/);
  assert.throws(() => Minimalism.minimalismScore("subsystem", 1, 1, []), /minimalism_score_requires_evidence/);
  assert.throws(() => LongHorizon.longHorizonSimulation({
    days: 30,
    semanticDrift: 0,
    maxSemanticDrift: 1,
    replayEventsPerDay: 1,
    maxReplayEventsPerDay: 1,
    governanceRot: 0,
    maxGovernanceRot: 1,
    memoryGrowthPerDay: 0,
    maxMemoryGrowthPerDay: 1,
    ontologyGrowthPerDay: 0,
    maxOntologyGrowthPerDay: 1,
    identityContinuity: true,
    operationalTruthPreserved: true,
    recoveryCapabilityPreserved: true
  }, []), /long_horizon_simulation_requires_evidence/);
});

test("incident journal creation preserves replay snapshot and append-only incident record", () => {
  const snapshot: Incidents.IncidentReplaySnapshot = {
    snapshotId: "snap_1",
    fromSeq: 10,
    toSeq: 20,
    replayHash: "hash_incident",
    evidenceIds: ["ev_snapshot"]
  };
  const captured = Incidents.replaySnapshot(snapshot, ["ev_snapshot_capture"]);
  assert.equal(captured.status, "INCIDENT_REPLAY_SNAPSHOT_CAPTURED");

  const timeline = Incidents.incidentTimeline([
    { seq: 1, timestampMs: 1000, event: "websocket_reconnect", evidenceIds: ["ev_t1"] },
    { seq: 2, timestampMs: 1001, event: "duplicate_fill", evidenceIds: ["ev_t2"] }
  ], ["ev_timeline"]);
  assert.equal(timeline.status, "INCIDENT_TIMELINE_RECORDED");

  assert.equal(Incidents.incidentRootCause("exchange_stream", "duplicated fill after reconnect", 0.9, ["ev_root"]).status, "ROOT_CAUSE_IDENTIFIED");
  assert.equal(Incidents.incidentImpact(1, 0.2, "medium", ["ev_impact"]).status, "INCIDENT_IMPACT_MATERIAL");
  assert.equal(Incidents.incidentRecovery("freeze execution and reconcile fills", true, true, ["ev_recovery"]).status, "INCIDENT_RECOVERED");
  assert.equal(Incidents.incidentAttestation("incident_1", "trace_1", true, true, ["ev_attest"]).status, "INCIDENT_ATTESTED");

  const journal = new Incidents.IncidentJournal();
  const records = journal.append({
    incidentId: "incident_1",
    traceId: "trace_1",
    timeline: timeline.entries,
    rootCause: "exchange_stream",
    impact: "duplicate_fill",
    recoveryAction: "freeze execution and reconcile fills",
    replaySnapshot: snapshot,
    attestation: "INCIDENT_ATTESTED",
    operatorNotes: ["reviewed by operator"],
    evidenceIds: ["ev_incident"]
  });
  assert.equal(records.length, 1);
  assert.throws(() => journal.append(records[0]!), /incident_journal_is_append_only/);
});

test("runtime scars recommend safer checks without doctrine mutation", () => {
  const scar = Scars.runtimeScar({
    scarId: "scar_binance_duplicate_fill",
    pattern: "Binance duplicated fills under reconnect storm",
    incidentIds: ["incident_1"],
    recommendedCheck: "block execution until fill replay reconciles after reconnect",
    evidenceIds: ["ev_scar"]
  }, ["ev_scar_record"]);
  assert.equal(scar.status, "RUNTIME_SCAR_RECORDED");
  assert.equal(scar.doctrineMutated, false);

  const registry = new Scars.ScarRegistry();
  assert.equal(registry.remember(scar.scar).length, 1);
  assert.equal(Scars.scarTrigger(scar.scar.pattern, scar.scar.pattern, 2, 2, ["ev_trigger"]).status, "SCAR_TRIGGERED");
  const recommendation = Scars.scarRecommendation(scar.scar.scarId, scar.scar.recommendedCheck, false, true, ["ev_rec"]);
  assert.equal(recommendation.status, "SCAR_RECOMMENDATION_PENDING_APPROVAL");
  assert.equal(recommendation.doctrineMutated, false);
  assert.equal(Scars.doctrineAdjustmentCandidate("candidate_1", scar.scar.scarId, "require post-reconnect fill replay", true, ["ev_candidate"]).status, "DOCTRINE_ADJUSTMENT_CANDIDATE_RECOMMENDED_ONLY");
  assert.equal(Scars.scarAttestation("trace_scar", true, true, true, ["ev_attest"]).status, "SCAR_ATTESTED");
});

test("deployment profiles define authority and gates block unsafe profile upgrades", () => {
  const paper = Deployment.paperProfile(["BTCUSDT"], ["ev_paper"]);
  const limited = Deployment.limitedLiveProfile(["BTCUSDT"], 0.01, 0.05, ["ev_limited"]);
  assert.equal(paper.executionAuthority, "paper");
  assert.equal(limited.autonomyLevel, "bounded");
  assert.equal(Deployment.deploymentProfileSpec(limited, ["ev_spec"]).status, "DEPLOYMENT_PROFILE_SPEC_ACCEPTED");

  const gate = Deployment.deploymentGates({
    currentProfile: "paper",
    requestedProfile: "full-live",
    certificationPassed: false,
    burnInPassed: false,
    activeIncident: false,
    reconciliationFresh: true,
    desyncActive: false
  }, ["ev_gate"]);
  assert.equal(gate.status, "DEPLOYMENT_GATE_BLOCKED");
  assert.deepEqual(gate.failures, ["full_live_requires_certification", "autonomy_increase_requires_burn_in"]);

  const gatekeeper = Deployment.deploymentGatekeeper({
    currentProfile: "limited-live",
    requestedProfile: "full-live",
    certificationPassed: true,
    burnInPassed: true,
    activeIncident: true,
    reconciliationFresh: true,
    desyncActive: false
  }, ["ev_gatekeeper"]);
  assert.equal(gatekeeper.status, "DEPLOYMENT_UPGRADE_BLOCKED");
  assert.deepEqual(gatekeeper.failures, ["deployment_upgrade_blocked_during_incident"]);
});

test("burn-in certification gates autonomy increases", () => {
  const noCrash = BurnIn.noCrashCheck(0, 24, ["ev_no_crash"]);
  const replay = BurnIn.replayDivergenceCheck(0, 7, ["ev_replay"]);
  const ontology = BurnIn.ontologyInflationCheck(0, 30, ["ev_ontology"]);
  const survivability = BurnIn.survivabilityStabilityCheck(0.95, 0.9, 90, ["ev_survivability"]);
  const runner = BurnIn.burnInRunner([noCrash.status, replay.status, ontology.status, survivability.status], ["ev_runner"]);
  const certification = BurnIn.burnInCertification(
    noCrash.status === "NO_CRASH_24H_PASSED",
    replay.status === "NO_REPLAY_DIVERGENCE_7D_PASSED",
    ontology.status === "NO_ONTOLOGY_INFLATION_30D_PASSED",
    survivability.status === "SURVIVABILITY_STABLE_90D_PASSED",
    ["ev_cert"]
  );

  assert.equal(BurnIn.burnInWindow("24h", 24, 24, ["ev_window"]).status, "BURN_IN_WINDOW_COMPLETE");
  assert.equal(runner.status, "BURN_IN_RUN_PASSED");
  assert.equal(certification.status, "BURN_IN_CERTIFIED");
  assert.equal(certification.autonomyIncreaseAllowed, true);
  assert.equal(BurnIn.burnInCertification(true, false, true, true, ["ev_failed"]).autonomyIncreaseAllowed, false);
});

test("operator dashboard compresses runtime state into critical actionable summary", () => {
  const summary = OperatorDashboard.operatorSummary({
    currentMode: "limited-live",
    currentExposure: 0.03,
    pendingOrders: 1,
    reconciliationStatus: "stale",
    activeIncidents: 1,
    governanceBlocks: ["awaiting_post_incident_review"],
    liveRiskFlags: ["position_desync"],
    requiredOperatorActions: ["acknowledge_incident"]
  }, ["ev_summary"]);
  assert.equal(summary.status, "OPERATOR_ACTION_REQUIRED");
  assert.deepEqual(summary.requiredOperatorActions, ["acknowledge_incident"]);
  assert.equal(OperatorDashboard.criticalPath([
    { id: "acknowledge_incident", priority: 10, evidenceIds: ["ev_ack"] },
    { id: "review_dashboard", priority: 1, evidenceIds: ["ev_review"] }
  ], 1, ["ev_path"]).selected[0], "acknowledge_incident");
  assert.equal(OperatorDashboard.alertCompression([
    { alertId: "info_1", priority: "info", evidenceIds: ["ev_i"] },
    { alertId: "critical_1", priority: "critical", evidenceIds: ["ev_c"] }
  ], ["ev_alerts"]).compressed[0], "critical_1");
  assert.equal(OperatorDashboard.executionStatus(1, 1, 0, ["ev_exec"]).status, "EXECUTION_REQUIRES_OPERATOR_ATTENTION");
  assert.equal(OperatorDashboard.riskStatus(["desync"], 2, 1, ["ev_risk"]).status, "RISK_ACTION_REQUIRED");
  assert.equal(OperatorDashboard.incidentStatus(["incident_1"], [], ["ev_incident"]).status, "INCIDENT_ACK_REQUIRED");
  assert.equal(OperatorDashboard.dashboardAttestation("trace_dashboard", summary.status, true, true, ["ev_dash"]).status, "DASHBOARD_ATTESTED");
});

test("reality contact simulations detect exchange and network failure modes", () => {
  assert.equal(RealityContact.binancePartialOutage(false, true, ["ev_outage"]).status, "BINANCE_PARTIAL_OUTAGE_DETECTED");
  assert.equal(RealityContact.websocketDuplication(["e1", "e1", "e2"], ["ev_dup"]).status, "WEBSOCKET_DUPLICATION_DETECTED");
  assert.equal(RealityContact.reconnectStorm(10, 3, ["ev_reconnect"]).status, "RECONNECT_STORM_DETECTED");
  assert.equal(RealityContact.latencySpike(5000, 1000, ["ev_latency"]).status, "LATENCY_SPIKE_DETECTED");
  assert.equal(RealityContact.networkJitter(500, 100, ["ev_jitter"]).status, "NETWORK_JITTER_DETECTED");
  assert.equal(RealityContact.ntpDrift(1000, 100, ["ev_ntp"]).status, "NTP_DRIFT_DETECTED");
  assert.equal(RealityContact.staleListenKey(61_000, 60_000, false, ["ev_listen"]).status, "STALE_LISTEN_KEY_DETECTED");
  assert.equal(RealityContact.zombieOrder(["local_1"], ["local_1", "exchange_only"], ["ev_zombie"]).status, "ZOMBIE_ORDER_DETECTED");
});

test("reality contact detects orphan fills and position desync and blocks execution path", () => {
  const orphan = RealityContact.orphanFill(["order_1", "unknown_order"], ["order_1"], ["ev_orphan"]);
  assert.equal(orphan.status, "ORPHAN_FILL_DETECTED");
  assert.equal(orphan.action, "RECONSTRUCT_ORDER_LINEAGE");

  const desync = RealityContact.positionDesync(1, 1.5, 0.01, ["ev_desync"]);
  assert.equal(desync.status, "POSITION_DESYNC_DETECTED");
  assert.equal(desync.action, "BLOCK_EXECUTION_AND_RECONCILE");

  const gate = Deployment.deploymentGates({
    currentProfile: "limited-live",
    requestedProfile: "limited-live",
    certificationPassed: true,
    burnInPassed: true,
    activeIncident: false,
    reconciliationFresh: false,
    desyncActive: desync.status === "POSITION_DESYNC_DETECTED"
  }, ["ev_execution_gate"]);
  assert.equal(gate.status, "DEPLOYMENT_GATE_BLOCKED");
  assert.deepEqual(gate.failures, ["execution_blocked_by_stale_reconciliation", "order_submission_blocked_by_desync"]);
});

test("live execution certification rejects duplicate execution ghost orders and stale finality", () => {
  const failed = LiveExecution.liveExecutionCertification({
    duplicateExecutions: 1,
    ghostOrders: 1,
    unreconciledExposure: 1,
    directExchangeMutationBypass: true,
    restOnlyFinality: true,
    websocketOnlyFinality: true,
    unattestedExecutions: 1,
    ordersMissingIdempotencyKeys: 1,
    pendingOrdersUnrecovered: 1
  }, ["ev_live_exec"]);
  assert.equal(failed.status, "LIVE_EXECUTION_CERTIFICATION_FAILED");
  assert.equal(failed.failures.includes("missing_idempotency_key"), true);
  assert.equal(failed.failures.includes("rest_only_finality"), true);

  assert.equal(LiveExecution.liveExecutionCertification({
    duplicateExecutions: 0,
    ghostOrders: 0,
    unreconciledExposure: 0,
    directExchangeMutationBypass: false,
    restOnlyFinality: false,
    websocketOnlyFinality: false,
    unattestedExecutions: 0,
    ordersMissingIdempotencyKeys: 0,
    pendingOrdersUnrecovered: 0
  }, ["ev_live_exec_ok"]).status, "LIVE_EXECUTION_CERTIFIED");
});

test("operator escalation requires acknowledgement manual review and emergency stop confirmation", () => {
  assert.equal(OperatorEscalation.escalationDiscipline("emergency", true, true, true, true, ["ev_escalation"]).status, "OPERATOR_ESCALATION_DISCIPLINED");
  assert.equal(OperatorEscalation.escalationDiscipline("critical", false, true, false, true, ["ev_escalation_blocked"]).status, "OPERATOR_ESCALATION_BLOCKED");
});

test("live readiness report generates deterministic go no-go recommendation", () => {
  const noGo = LiveReadiness.liveReadinessReport({
    deploymentProfile: "full-live",
    burnInStatus: "BURN_IN_NOT_CERTIFIED",
    incidentHistoryCount: 2,
    activeScars: 1,
    reconciliationHealth: "healthy",
    replayHealth: "healthy",
    governanceHealth: "healthy",
    operatorReadiness: "ready",
    executionSafetyStatus: "LIVE_EXECUTION_CERTIFIED"
  }, ["ev_readiness"]);
  assert.equal(noGo.status, "LIVE_READINESS_REPORT_GENERATED");
  assert.equal(noGo.recommendation, "NO_GO");

  const go = LiveReadiness.liveReadinessReport({
    ...noGo,
    burnInStatus: "BURN_IN_CERTIFIED",
    incidentHistoryCount: 0,
    activeScars: 0
  }, ["ev_readiness_go"]);
  assert.equal(go.recommendation, "GO");
});

test("deployment maturity APIs fail closed without evidence", () => {
  assert.throws(() => Incidents.replaySnapshot({ snapshotId: "s", fromSeq: 1, toSeq: 1, replayHash: "h", evidenceIds: ["ev"] }, []), /incident_replay_snapshot_requires_evidence/);
  assert.throws(() => Scars.scarTrigger("a", "a", 1, 1, []), /scar_trigger_requires_evidence/);
  assert.throws(() => Deployment.paperProfile(["BTCUSDT"], []), /paper_profile_requires_evidence/);
  assert.throws(() => BurnIn.noCrashCheck(0, 24, []), /no_crash_check_requires_evidence/);
  assert.throws(() => OperatorDashboard.operatorSummary({ currentMode: "paper", currentExposure: 0, pendingOrders: 0, reconciliationStatus: "fresh", activeIncidents: 0, governanceBlocks: [], liveRiskFlags: [], requiredOperatorActions: [] }, []), /operator_summary_requires_evidence/);
  assert.throws(() => RealityContact.orphanFill(["order"], ["order"], []), /orphan_fill_requires_evidence/);
  assert.throws(() => LiveExecution.liveExecutionCertification({ duplicateExecutions: 0, ghostOrders: 0, unreconciledExposure: 0, directExchangeMutationBypass: false, restOnlyFinality: false, websocketOnlyFinality: false, unattestedExecutions: 0, ordersMissingIdempotencyKeys: 0, pendingOrdersUnrecovered: 0 }, []), /live_execution_certification_requires_evidence/);
  assert.throws(() => LiveReadiness.liveReadinessReport({ deploymentProfile: "paper", burnInStatus: "BURN_IN_NOT_CERTIFIED", incidentHistoryCount: 0, activeScars: 0, reconciliationHealth: "healthy", replayHealth: "healthy", governanceHealth: "healthy", operatorReadiness: "ready", executionSafetyStatus: "LIVE_EXECUTION_CERTIFIED" }, []), /live_readiness_report_requires_evidence/);
});

const simpleTrendConfig: SimpleTrendStrategyConfig = {
  accountEquityUsd: "10000",
  maxExposureUsd: "1000",
  maxDailyLossUsd: "100",
  maxOrderNotionalUsd: "50",
  minTrendStrengthBps: "50",
  minQuantity: "0.001",
  quantityStepSize: "0.001",
  orderType: "MARKET",
  maxChildQuantity: "0.1"
};

test("SimpleTrendFollowingStrategy emits deterministic LONG signal on SMA20/SMA50 cross with volume confirmation", () => {
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  let signals: ReturnType<SimpleTrendFollowingStrategy["evaluateMarketEvent"]> = [];
  for (let seq = 1; seq <= 50; seq += 1) {
    signals = strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
    assert.equal(signals.length, 0);
  }

  signals = strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20"));

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.signalType, "SIMPLE_TREND_CROSS");
  assert.equal(signals[0]?.payload.bias, "LONG");
  assert.equal(signals[0]?.payload.previousSma20, "100");
  assert.equal(signals[0]?.payload.previousSma50, "100");
  assert.equal(signals[0]?.payload.currentSma20, "103");
  assert.equal(signals[0]?.payload.currentSma50, "101.2");
  assert.equal(signals[0]?.payload.currentExposureUsd, "100");
  assert.equal(signals[0]?.payload.dailyLossUsd, "0");
});

test("SimpleTrendFollowingStrategy emits deterministic SHORT signal on SMA20/SMA50 cross", () => {
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    assert.equal(strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10")).length, 0);
  }

  const signals = strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "40", "20"));

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.payload.bias, "SHORT");
  assert.equal(signals[0]?.payload.currentSma20, "97");
  assert.equal(signals[0]?.payload.currentSma50, "98.8");
});

test("SimpleTrendFollowingStrategy suppresses flat trend and weak volume conditions", () => {
  const flatStrategy = new SimpleTrendFollowingStrategy({ ...simpleTrendConfig, minTrendStrengthBps: "5000" });
  const weakVolumeStrategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    flatStrategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
    weakVolumeStrategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
  }

  assert.equal(flatStrategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20")).length, 0);
  assert.equal(weakVolumeStrategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "10")).length, 0);
});

test("SimpleTrendFollowingStrategy does not emit duplicate intents while bias remains unchanged", () => {
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
  }

  assert.equal(strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20")).length, 1);
  assert.equal(strategy.evaluateMarketEvent(simpleTrendMarketEvent(52, "170", "20")).length, 0);
});

test("SimpleTrendFollowingStrategy converts validated signal into explainable risk-capped intent", () => {
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
  }
  const signal = signalEventFromSimpleTrendCandidate(strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20"))[0]);

  const decision = strategy.evaluate(signal, { nowMs: 51_000 });

  assert.equal(decision.allow, true);
  assert.equal(decision.reason, "simple_trend_intent_created");
  assert.equal(decision.intent?.symbol, "BTCUSDT");
  assert.equal(decision.intent?.payload.side, "BUY");
  assert.equal(decision.intent?.payload.type, "MARKET");
  assert.equal(decision.intent?.payload.quantity, "0.312");
  assert.equal(decision.intent?.payload.notionalUsd, "50");
  assert.equal(decision.intent?.payload.riskPctOfEquity, "0.01");
  assert.equal(decision.intent?.payload.strategyReason, "LONG SMA20/SMA50 crossover with volume confirmation");
  assert.deepEqual((decision.intent?.payload.replayMetadata as { deterministicInputs: string[] }).deterministicInputs, [
    "MARKET_TICK.price",
    "MARKET_TICK.volume_or_quantity",
    "SMA20",
    "SMA50",
    "rollingAverageVolume",
    "minTrendStrengthBps"
  ]);
});

test("SimpleTrendFollowingStrategy rejects signal conversion when governance or daily loss blocks risk", () => {
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
  }
  const candidate = strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20"))[0];
  const governanceBlocked = signalEventFromSimpleTrendCandidate(candidate, { governanceAllowed: false });
  const dailyLossBlocked = signalEventFromSimpleTrendCandidate(candidate, { dailyLossUsd: "100" });

  assert.deepEqual(strategy.evaluate(governanceBlocked, { nowMs: 51_000 }), { allow: false, reason: "governance_restriction" });
  assert.deepEqual(strategy.evaluate(dailyLossBlocked, { nowMs: 51_000 }), { allow: false, reason: "max_daily_loss_reached" });
});

function simpleTrendMarketEvent(seq: number, price: string, volume: string): RuntimeEvent {
  return RuntimeEventSchema.parse({
    seq,
    timestamp: seq * 1000,
    receiveTimestamp: seq * 1000,
    processingTimestamp: seq * 1000,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_simple_trend",
    causationId: "root",
    payload: {
      price,
      volume,
      currentExposureUsd: "100",
      dailyLossUsd: "0"
    }
  });
}

function signalEventFromSimpleTrendCandidate(
  candidate: ReturnType<SimpleTrendFollowingStrategy["evaluateMarketEvent"]>[number] | undefined,
  payloadOverrides: Record<string, unknown> = {}
): RuntimeEvent {
  assert.notEqual(candidate, undefined);
  return RuntimeEventSchema.parse({
    seq: 200,
    timestamp: 51_000,
    receiveTimestamp: 51_000,
    processingTimestamp: 51_000,
    source: "runtime",
    symbol: candidate?.symbol ?? "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_simple_trend",
    causationId: "51",
    payload: {
      providerId: "simple_trend_following_v1",
      signalType: candidate?.signalType,
      confidence: 1,
      ...candidate?.payload,
      ...payloadOverrides
    }
  });
}

test("SignalEngine registers deterministic strategies in explicit initialization order", () => {
  const engine = new SignalEngine();
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);

  engine.registerStrategy(strategy);

  assert.deepEqual(engine.listProviders().map((provider) => provider.id), ["simple_trend_following_v1"]);
  assert.throws(() => engine.registerStrategy(strategy), /signal_provider_duplicate:simple_trend_following_v1/);
});

test("CompositeSignalToIntentPolicy routes strategy signals without bypassing intent policy order", async () => {
  const policy = new CompositeSignalToIntentPolicy();
  const strategy = new SimpleTrendFollowingStrategy(simpleTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(simpleTrendMarketEvent(seq, "100", "10"));
  }
  const signal = signalEventFromSimpleTrendCandidate(strategy.evaluateMarketEvent(simpleTrendMarketEvent(51, "160", "20"))[0]);

  policy.register(strategy);
  const decision = await policy.evaluate(signal, { nowMs: 51_000 });

  assert.equal(policy.listStrategies()[0]?.id, "simple_trend_following_v1");
  assert.equal(decision.allow, true);
  assert.equal(decision.intent?.payload.strategyId, "simple_trend_following_v1");
  assert.throws(() => policy.register(strategy), /signal_strategy_duplicate:simple_trend_following_v1/);
});

test("runtime registerSignalStrategy wires MARKET_TICK through signal intent and execution lifecycle", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalStrategy(new SimpleTrendFollowingStrategy(simpleTrendConfig));

  await runtime.start();
  for (let seq = 1; seq <= 50; seq += 1) {
    await runtime.ingest(simpleTrendMarketInput("100", "10"));
  }
  await runtime.ingest(simpleTrendMarketInput("160", "20"));

  assert.deepEqual(eventStore.events.slice(-7).map((event) => event.eventType), [
    "MARKET_TICK",
    "SIGNAL_CREATED",
    "INTENT_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_SUBMITTED",
    "ORDER_SUBMITTED",
    "ORDER_SUBMITTED"
  ]);
  const signal = eventStore.events.find((event) => event.eventType === "SIGNAL_CREATED");
  const intent = eventStore.events.find((event) => event.eventType === "INTENT_CREATED");
  assert.equal(signal?.payload.strategyId, "simple_trend_following_v1");
  assert.equal(intent?.eventId, `intent:composite_signal_to_intent:${signal?.seq}`);
  assert.equal(intent?.payload.policyId, "composite_signal_to_intent");
  assert.equal(intent?.payload.strategyReason, "LONG SMA20/SMA50 crossover with volume confirmation");
  assert.equal((intent?.payload.replayMetadata as { sourceSignalSeq: number }).sourceSignalSeq, signal?.seq);
  assert.equal(audit.entries("signal_intent_generated").length, 1);
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 4);

  await runtime.stop();
});

test("runtime strategy wiring is replay deterministic for identical market event sequence", async () => {
  const firstStore = new MemoryEventStore();
  const secondStore = new MemoryEventStore();
  const first = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: firstStore, audit: new MemoryAuditLog() });
  const second = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: secondStore, audit: new MemoryAuditLog() });
  first.registerSignalStrategy(new SimpleTrendFollowingStrategy(simpleTrendConfig));
  second.registerSignalStrategy(new SimpleTrendFollowingStrategy(simpleTrendConfig));

  await first.start();
  await second.start();
  for (let seq = 1; seq <= 50; seq += 1) {
    await first.ingest(simpleTrendMarketInput("100", "10"));
    await second.ingest(simpleTrendMarketInput("100", "10"));
  }
  await first.ingest(simpleTrendMarketInput("160", "20"));
  await second.ingest(simpleTrendMarketInput("160", "20"));

  const firstIntent = firstStore.events.find((event) => event.eventType === "INTENT_CREATED");
  const secondIntent = secondStore.events.find((event) => event.eventType === "INTENT_CREATED");
  assert.deepEqual(firstStore.events.map((event) => event.eventType), secondStore.events.map((event) => event.eventType));
  assert.deepEqual(firstIntent?.payload, secondIntent?.payload);
  assert.equal(firstIntent?.eventId, secondIntent?.eventId);

  await first.stop();
  await second.stop();
});

function simpleTrendMarketInput(price: string, volume: string): EventInput {
  return {
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_simple_trend_runtime",
    causationId: "market",
    payload: {
      price,
      volume,
      currentExposureUsd: "100",
      dailyLossUsd: "0"
    }
  };
}

const operationalTrendConfig: SimpleTrendFollowingConfig = {
  accountEquityUsd: "10000",
  maxExposureUsd: "1000",
  maxDailyLossUsd: "100",
  maxOrderNotionalUsd: "50",
  minSmaSeparationBps: "50",
  minVolatilityBps: "5",
  maxVolatilityBps: "500",
  maxSpreadBps: "20",
  minFeedConfidence: "0.8",
  minGovernanceConfidence: "0.9",
  minSurvivabilityScore: "80",
  minQuantity: "0.001",
  quantityStepSize: "0.001",
  orderType: "MARKET",
  trailingStopBps: "100",
  maxHoldBars: 5,
  maxChildQuantity: "0.1"
};

test("Operational SimpleTrendFollowingStrategy emits explainable LONG entry intent under healthy market context", () => {
  const strategy = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    assert.equal(strategy.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10")).length, 0);
  }

  const signals = strategy.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20"));
  const signal = operationalTrendSignalEvent(signals[0]);
  const decision = strategy.evaluate(signal, { nowMs: 51_000 });

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.payload.action, "ENTRY");
  assert.equal(signals[0]?.payload.bias, "LONG");
  assert.equal(decision.allow, true);
  assert.equal(decision.reason, "simple_trend_entry_intent_created");
  assert.equal(decision.intent?.payload.side, "BUY");
  assert.equal(decision.intent?.payload.reduceOnly, false);
  assert.equal(decision.intent?.payload.quantity, "0.312");
  assert.equal(decision.intent?.payload.strategyId, "simple_trend_following_operational_v1");
  assert.equal((decision.intent?.payload.marketContext as { sma20: string }).sma20, "103");
  const alphaMeasurement = decision.intent?.payload.alphaMeasurement as { mae: string; mfe: string; fillDrift: string; signalToFillLatency: string };
  assert.equal(alphaMeasurement.mae, "measured_by_StateManager");
  assert.equal(alphaMeasurement.mfe, "measured_by_StateManager");
  assert.equal(alphaMeasurement.fillDrift, "measured_by_StateManager");
  assert.equal(alphaMeasurement.signalToFillLatency, "measured_by_StateManager");
});

test("Operational SimpleTrendFollowingStrategy consumes Binance trade quantity as real-time volume", () => {
  const strategy = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    assert.equal(strategy.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10", { volume: undefined, quantity: "10" })).length, 0);
  }

  const signals = strategy.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20", { volume: undefined, quantity: "20" }));

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.payload.action, "ENTRY");
  assert.equal(signals[0]?.payload.volume, "20");
  assert.equal(signals[0]?.payload.averageVolume, "10");
});

test("Operational SimpleTrendFollowingStrategy refuses entries inside no-trade zones", () => {
  const wideSpread = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  const lowConfidence = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  const unstableExchange = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    wideSpread.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
    lowConfidence.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
    unstableExchange.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
  }

  assert.equal(wideSpread.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20", { spreadBps: "25" })).length, 0);
  assert.equal(lowConfidence.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20", { survivabilityScore: "70" })).length, 0);
  assert.equal(unstableExchange.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20", { exchangeStable: false })).length, 0);
});

test("Operational SimpleTrendFollowingStrategy filters low and abnormal volatility", () => {
  const lowVolatility = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  const spikeVolatility = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    lowVolatility.evaluateMarketEvent(operationalTrendMarketEvent(seq, seq % 2 === 0 ? "100" : "100.01", "10"));
    spikeVolatility.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
  }

  assert.equal(lowVolatility.evaluateMarketEvent(operationalTrendMarketEvent(51, "101", "20")).length, 0);
  assert.equal(spikeVolatility.evaluateMarketEvent(operationalTrendMarketEvent(51, "1000", "20")).length, 0);
});

test("Operational SimpleTrendFollowingStrategy emits deterministic reduce-only trailing stop exit", () => {
  const strategy = new OperationalSimpleTrendFollowingStrategy({ ...operationalTrendConfig, maxHoldBars: 20 });
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
  }
  assert.equal(strategy.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20")).length, 1);
  assert.equal(strategy.evaluateMarketEvent(operationalTrendMarketEvent(52, "170", "20")).length, 0);

  const exitSignals = strategy.evaluateMarketEvent(operationalTrendMarketEvent(53, "150", "20", { activePositionQuantity: "0.312" }));
  const decision = strategy.evaluate(operationalTrendSignalEvent(exitSignals[0]), { nowMs: 53_000 });

  assert.equal(exitSignals.length, 1);
  assert.equal(exitSignals[0]?.payload.action, "EXIT");
  assert.equal(exitSignals[0]?.payload.exitReason, "TRAILING_STOP");
  assert.equal(decision.allow, true);
  assert.equal(decision.intent?.payload.side, "SELL");
  assert.equal(decision.intent?.payload.reduceOnly, true);
  assert.equal(decision.intent?.payload.quantity, "0.312");
});

test("Operational SimpleTrendFollowingStrategy emits max-hold timeout exit", () => {
  const strategy = new OperationalSimpleTrendFollowingStrategy({
    ...operationalTrendConfig,
    maxHoldBars: 1,
    maxVolatilityBps: "10000",
    trailingStopBps: "1000"
  });
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
  }
  assert.equal(strategy.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20")).length, 1);
  const exit = strategy.evaluateMarketEvent(operationalTrendMarketEvent(52, "161", "20"));

  assert.equal(exit.length, 1);
  assert.equal(exit[0]?.payload.action, "EXIT");
  assert.equal(exit[0]?.payload.exitReason, "MAX_HOLD_TIMEOUT");
});

test("Operational SimpleTrendFollowingStrategy respects daily loss and exposure constraints", () => {
  const strategy = new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig);
  for (let seq = 1; seq <= 50; seq += 1) {
    strategy.evaluateMarketEvent(operationalTrendMarketEvent(seq, "100", "10"));
  }
  const candidate = strategy.evaluateMarketEvent(operationalTrendMarketEvent(51, "160", "20"))[0];

  assert.deepEqual(strategy.evaluate(operationalTrendSignalEvent(candidate, { dailyLossUsd: "100" }), { nowMs: 51_000 }), {
    allow: false,
    reason: "max_daily_loss_reached"
  });
  assert.deepEqual(strategy.evaluate(operationalTrendSignalEvent(candidate, { currentExposureUsd: "1000" }), { nowMs: 51_000 }), {
    allow: false,
    reason: "max_exposure_reached"
  });
});

test("runtime wires operational SimpleTrendFollowingStrategy through SignalEngine deterministically", async () => {
  const firstStore = new MemoryEventStore();
  const secondStore = new MemoryEventStore();
  const deterministicRuntimeClock = {
    nowMs: () => 1_700_000_000_000,
    monotonicMs: () => 1_700_000_000_000
  };
  const first = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: firstStore,
    audit: new MemoryAuditLog(),
    clock: deterministicRuntimeClock
  });
  const second = new TradingRuntime({
    config: baseConfig,
    logger: createLogger(baseConfig),
    eventStore: secondStore,
    audit: new MemoryAuditLog(),
    clock: deterministicRuntimeClock
  });
  first.registerSignalStrategy(new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig));
  second.registerSignalStrategy(new OperationalSimpleTrendFollowingStrategy(operationalTrendConfig));

  await first.start();
  await second.start();
  for (let seq = 1; seq <= 50; seq += 1) {
    await first.ingest(operationalTrendMarketInput("100", "10"));
    await second.ingest(operationalTrendMarketInput("100", "10"));
  }
  await first.ingest(operationalTrendMarketInput("160", "20"));
  await second.ingest(operationalTrendMarketInput("160", "20"));

  const firstIntent = firstStore.events.find((event) => event.eventType === "INTENT_CREATED");
  const secondIntent = secondStore.events.find((event) => event.eventType === "INTENT_CREATED");
  assert.deepEqual(firstStore.events.map((event) => event.eventType), secondStore.events.map((event) => event.eventType));
  assert.equal(firstIntent?.payload.strategyId, "simple_trend_following_operational_v1");
  assert.deepEqual(firstIntent?.payload, secondIntent?.payload);
  assert.equal(firstIntent?.eventId, secondIntent?.eventId);

  await first.stop();
  await second.stop();
});

function operationalTrendMarketInput(price: string, volume: string, payload: Record<string, unknown> = {}): EventInput {
  return {
    timestamp: 1_700_000_000_000,
    receiveTimestamp: 1_700_000_000_000,
    processingTimestamp: 1_700_000_000_000,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_operational_trend",
    causationId: "market",
    payload: {
      price,
      volume,
      spreadBps: "5",
      feedConfidence: "1",
      governanceConfidence: "1",
      survivabilityScore: "100",
      exchangeStable: true,
      currentExposureUsd: "100",
      dailyLossUsd: "0",
      ...payload
    }
  };
}

function operationalTrendMarketEvent(seq: number, price: string, volume: string, payload: Record<string, unknown> = {}): RuntimeEvent {
  return RuntimeEventSchema.parse({
    seq,
    timestamp: seq * 1000,
    receiveTimestamp: seq * 1000,
    processingTimestamp: seq * 1000,
    ...operationalTrendMarketInput(price, volume, payload)
  });
}

function operationalTrendSignalEvent(
  candidate: ReturnType<OperationalSimpleTrendFollowingStrategy["evaluateMarketEvent"]>[number] | undefined,
  payloadOverrides: Record<string, unknown> = {}
): RuntimeEvent {
  assert.notEqual(candidate, undefined);
  return RuntimeEventSchema.parse({
    seq: 300,
    timestamp: 51_000,
    receiveTimestamp: 51_000,
    processingTimestamp: 51_000,
    source: "runtime",
    symbol: candidate?.symbol ?? "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_operational_trend",
    causationId: "51",
    payload: {
      providerId: "simple_trend_following_operational_v1",
      signalType: candidate?.signalType,
      confidence: candidate?.confidence ?? 1,
      ...candidate?.payload,
      ...payloadOverrides
    }
  });
}
class MockMainnetTinyRest implements MainnetTinyRest {
  newOrderCalls = 0;
  cancelOrderCalls = 0;
  exchangeInfoResponse: BinanceExchangeInfo = {
    symbols: [
      {
        symbol: "ETHUSDT",
        status: "TRADING",
        baseAsset: "ETH",
        quoteAsset: "USDT",
        filters: [
          { filterType: "PRICE_FILTER", minPrice: "0.01", tickSize: "0.01" },
          { filterType: "LOT_SIZE", minQty: "0.001", maxQty: "10000", stepSize: "0.001" },
          { filterType: "MIN_NOTIONAL", minNotional: "20" }
        ]
      },
      {
        symbol: "BTCUSDT",
        status: "TRADING",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        filters: [
          { filterType: "PRICE_FILTER", minPrice: "0.10", tickSize: "0.10" },
          { filterType: "LOT_SIZE", minQty: "0.0001", maxQty: "1000", stepSize: "0.0001" },
          { filterType: "MIN_NOTIONAL", minNotional: "50" }
        ]
      }
    ]
  };
  balancesResponse: BinanceAccountBalance[] = [{ asset: "USDT", balance: "100", availableBalance: "100" }];
  openOrdersResponse: BinanceOpenOrder[] = [];
  positionRiskResponse: BinancePositionRisk[] = [{ symbol: "ETHUSDT", positionAmt: "0", entryPrice: "0", markPrice: "3000", notional: "0", leverage: "1", unrealizedProfit: "0" }];
  tickerResponse: { bidPrice?: string; askPrice?: string } = { bidPrice: "3000.00", askPrice: "3000.10" };
  premiumResponse: { markPrice?: string } = { markPrice: "3000.05" };
  serverTimeResponse = { serverTime: Date.now() };
  positionModeResponse = { dualSidePosition: false };
  orderResponse: BinanceOrderResponse = {
    symbol: "ETHUSDT",
    orderId: 123,
    clientOrderId: "mainnet_tiny_ETHUSDT_run1",
    status: "NEW",
    executedQty: "0.0000",
    origQty: "0.0011",
    price: "49950.00",
    side: "BUY",
    type: "LIMIT"
  };

  baseUrl(): string {
    return BINANCE_FUTURES_PRODUCTION_REST_URL;
  }

  rateLimitSnapshot(): unknown {
    return {};
  }

  async exchangeInfo(): Promise<BinanceExchangeInfo> {
    return this.exchangeInfoResponse;
  }

  async accountBalance(): Promise<BinanceAccountBalance[]> {
    return this.balancesResponse;
  }

  async openOrders(): Promise<BinanceOpenOrder[]> {
    return this.openOrdersResponse;
  }

  async positionRisk(): Promise<BinancePositionRisk[]> {
    return this.positionRiskResponse;
  }

  async publicRequest<T>(_method?: "GET", endpoint?: string): Promise<T> {
    if (endpoint === "/fapi/v1/premiumIndex") return this.premiumResponse as T;
    return this.tickerResponse as T;
  }

  async newOrder(): Promise<BinanceOrderResponse> {
    this.newOrderCalls += 1;
    this.openOrdersResponse = [{
      symbol: this.orderResponse.symbol,
      orderId: this.orderResponse.orderId,
      clientOrderId: this.orderResponse.clientOrderId,
      price: this.orderResponse.price ?? "0",
      origQty: this.orderResponse.origQty ?? "0",
      executedQty: this.orderResponse.executedQty ?? "0",
      status: this.orderResponse.status,
      type: this.orderResponse.type ?? "LIMIT",
      side: this.orderResponse.side ?? "BUY"
    }];
    return this.orderResponse;
  }

  async cancelOrder(): Promise<BinanceOrderResponse> {
    this.cancelOrderCalls += 1;
    return { ...this.orderResponse, status: "CANCELED" };
  }

  async serverTime(): Promise<{ serverTime: number }> {
    return this.serverTimeResponse;
  }

  async signedRequest<T>(): Promise<T> {
    return this.positionModeResponse as T;
  }
}

function mainnetTinyConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    ...liveTestConfig,
    maxOrderNotionalUsd: 60,
    maxExposureUsd: 60,
    maxDailyLossUsd: 100,
    maxLeverage: 2,
    killSwitch: false,
    ...overrides
  };
}

function mainnetTinyEnv(overrides: Partial<MainnetTinyEnv> = {}): MainnetTinyEnv {
  return {
    ALLOW_MAINNET_TINY_ORDER: "true",
    MAINNET_TINY_ORDER_CONFIRMATION: "I_ACCEPT_ONE_TINY_REAL_MONEY_LIMIT_ORDER",
    MAINNET_TINY_ORDER_RUN_ID: "run1",
    MAINNET_DAILY_LOSS_USD: "0",
    MAINNET_DAILY_LOSS_STATE_FRESH: "true",
    MAINNET_SURVIVABILITY_SNAPSHOT_READY: "true",
    MAINNET_SURVIVABILITY_SNAPSHOT_DEGRADED: "false",
    MAINNET_EXPECTED_POSITION_MODE: "ONE_WAY",
    MAINNET_MAX_CLOCK_OFFSET_MS: "1000",
    MAX_ORDER_NOTIONAL_USD: "60",
    MAX_EXPOSURE_USD: "60",
    ...overrides
  };
}

async function assertMainnetTinyRefuses(config: RuntimeConfig, env: MainnetTinyEnv, rest: MockMainnetTinyRest, expectedReason: string): Promise<void> {
  await assert.rejects(
    () => executeMainnetTinyOrder({ config, env, rest }),
    (error: unknown) => error instanceof MainnetTinyRefusal && error.reason === expectedReason
  );
  assert.equal(rest.newOrderCalls, 0);
}

test("mainnet tiny order refuses local environment gates before newOrder", async () => {
  await assertMainnetTinyRefuses(mainnetTinyConfig({ killSwitch: true }), mainnetTinyEnv(), new MockMainnetTinyRest(), "KILL_SWITCH_must_be_false");
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv({ ALLOW_MAINNET_TINY_ORDER: undefined }), new MockMainnetTinyRest(), "ALLOW_MAINNET_TINY_ORDER_must_be_true");
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv({ MAINNET_TINY_ORDER_CONFIRMATION: undefined }), new MockMainnetTinyRest(), "MAINNET_TINY_ORDER_CONFIRMATION_missing");
  await assertMainnetTinyRefuses(mainnetTinyConfig({ binanceUseTestnet: true, binanceFuturesRestUrl: "https://demo-fapi.binance.com" }), mainnetTinyEnv(), new MockMainnetTinyRest(), "BINANCE_USE_TESTNET_must_be_false");
  await assertMainnetTinyRefuses(mainnetTinyConfig({ dryRun: true }), mainnetTinyEnv(), new MockMainnetTinyRest(), "DRY_RUN_must_be_false");
  await assertMainnetTinyRefuses(mainnetTinyConfig({ maxOrderNotionalUsd: 61 }), mainnetTinyEnv(), new MockMainnetTinyRest(), "MAX_ORDER_NOTIONAL_USD_must_be_lte_60");
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv({ MAX_ORDER_NOTIONAL_USD: undefined }), new MockMainnetTinyRest(), "MAX_ORDER_NOTIONAL_USD_missing");
});

test("mainnet tiny order refuses unsafe exchange state before newOrder", async () => {
  const highLeverage = new MockMainnetTinyRest();
  highLeverage.positionRiskResponse = [{ ...highLeverage.positionRiskResponse[0]!, leverage: "3" }];
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), highLeverage, "ETHUSDT_leverage_exceeds_2");

  const openPosition = new MockMainnetTinyRest();
  openPosition.positionRiskResponse = [{ ...openPosition.positionRiskResponse[0]!, positionAmt: "0.001", notional: "50" }];
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), openPosition, "ETHUSDT_position_amount_nonzero");

  const openOrder = new MockMainnetTinyRest();
  openOrder.openOrdersResponse = [{ symbol: "ETHUSDT", orderId: 1, clientOrderId: "open", price: "1", origQty: "1", executedQty: "0", status: "NEW", type: "LIMIT", side: "BUY" }];
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), openOrder, "ETHUSDT_open_order_exists");

  const minNotionalTooHigh = new MockMainnetTinyRest();
  minNotionalTooHigh.exchangeInfoResponse.symbols[0]!.filters = minNotionalTooHigh.exchangeInfoResponse.symbols[0]!.filters.map((filter) => filter.filterType === "MIN_NOTIONAL" ? { ...filter, minNotional: "61" } : filter);
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), minNotionalTooHigh, "binance_minNotional_exceeds_MAX_ORDER_NOTIONAL_USD");

  const noPrice = new MockMainnetTinyRest();
  noPrice.tickerResponse = {};
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), noPrice, "price_source_unavailable");

  const notionalOverCap = new MockMainnetTinyRest();
  await assert.rejects(
    () => executeMainnetTinyOrder({ config: mainnetTinyConfig({ maxOrderNotionalUsd: 20 }), env: mainnetTinyEnv({ MAX_ORDER_NOTIONAL_USD: "20" }), rest: notionalOverCap }),
    (error: unknown) => {
      assert.equal(error instanceof MainnetTinyRefusal, true);
      const refusal = error as MainnetTinyRefusal;
      assert.equal(refusal.reason, "computed_notional_exceeds_MAX_ORDER_NOTIONAL_USD");
      assert.equal(refusal.context.maxOrderNotionalUsd, "20");
      assert.equal(refusal.context.binanceMinNotional, "20");
      assert.equal(refusal.context.stepSize, "0.001");
      assert.equal(refusal.context.tickSize, "0.01");
      assert.equal(refusal.context.markPrice, "3000.05");
      assert.equal(refusal.context.bestBid, "3000");
      assert.equal(refusal.context.selectedPrice, refusal.context.computedPrice);
      return true;
    }
  );
  assert.equal(notionalOverCap.newOrderCalls, 0);
});

test("mainnet tiny order refuses stale daily loss clock mode and market preflight failures", async () => {
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv({ MAINNET_DAILY_LOSS_STATE_FRESH: "false" }), new MockMainnetTinyRest(), "MAINNET_DAILY_LOSS_STATE_FRESH_must_be_true");

  const staleClock = new MockMainnetTinyRest();
  staleClock.serverTimeResponse = { serverTime: Date.now() - 5_000 };
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), staleClock, "clock_offset_exceeds_tolerance");

  const hedgeMode = new MockMainnetTinyRest();
  hedgeMode.positionModeResponse = { dualSidePosition: true };
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), hedgeMode, "position_mode_mismatch");

  const noMark = new MockMainnetTinyRest();
  noMark.premiumResponse = {};
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), noMark, "mark_price_unavailable");

  const invalidSpread = new MockMainnetTinyRest();
  invalidSpread.tickerResponse = { bidPrice: "3000.00", askPrice: "2999.90" };
  await assertMainnetTinyRefuses(mainnetTinyConfig(), mainnetTinyEnv(), invalidSpread, "spread_invalid");
});

test("mainnet tiny supports explicit BTCUSDT and refuses when BTC minimum executable notional exceeds cap", async () => {
  const btc = new MockMainnetTinyRest();
  btc.positionRiskResponse = [{ symbol: "BTCUSDT", positionAmt: "0", entryPrice: "0", markPrice: "50000", notional: "0", leverage: "1", unrealizedProfit: "0" }];
  btc.tickerResponse = { bidPrice: "50000.00", askPrice: "50000.10" };
  btc.premiumResponse = { markPrice: "50000.05" };
  const accepted = await executeMainnetTinyOrder({ config: mainnetTinyConfig(), env: mainnetTinyEnv({ MAINNET_TINY_SYMBOL: "BTCUSDT" }), rest: btc });
  assert.equal(accepted.plan.symbol, "BTCUSDT");
  assert.equal(accepted.plan.clientOrderId.startsWith("mainnet_tiny_BTCUSDT_"), true);

  const btcTooSmallCap = new MockMainnetTinyRest();
  btcTooSmallCap.positionRiskResponse = [{ symbol: "BTCUSDT", positionAmt: "0", entryPrice: "0", markPrice: "50000", notional: "0", leverage: "1", unrealizedProfit: "0" }];
  btcTooSmallCap.tickerResponse = { bidPrice: "50000.00", askPrice: "50000.10" };
  btcTooSmallCap.premiumResponse = { markPrice: "50000.05" };
  await assertMainnetTinyRefuses(
    mainnetTinyConfig({ maxOrderNotionalUsd: 40 }),
    mainnetTinyEnv({ MAINNET_TINY_SYMBOL: "BTCUSDT", MAX_ORDER_NOTIONAL_USD: "40" }),
    btcTooSmallCap,
    "binance_minNotional_exceeds_MAX_ORDER_NOTIONAL_USD"
  );
});

test("mainnet tiny order refuses if accepted order cannot be reconciled in openOrders", async () => {
  class UnreconciledRest extends MockMainnetTinyRest {
    override async openOrders(): Promise<BinanceOpenOrder[]> {
      return [];
    }
  }
  const rest = new UnreconciledRest();
  await assert.rejects(
    () => executeMainnetTinyOrder({ config: mainnetTinyConfig(), env: mainnetTinyEnv(), rest }),
    (error: unknown) => error instanceof MainnetTinyRefusal && error.reason === "post_order_reconciliation_failed_open_order_missing"
  );
  assert.equal(rest.newOrderCalls, 1);
});

test("mainnet tiny accepted path calls newOrder exactly once", async () => {
  const rest = new MockMainnetTinyRest();
  const accepted = await executeMainnetTinyOrder({ config: mainnetTinyConfig(), env: mainnetTinyEnv(), rest });
  assert.equal(rest.newOrderCalls, 1);
  assert.equal(accepted.result, "MAINNET_TINY_LIMIT_ACCEPTED");
  assert.equal(accepted.plan.symbol, "ETHUSDT");
  assert.equal(accepted.plan.clientOrderId.startsWith("mainnet_tiny_ETHUSDT_"), true);
  assert.equal(accepted.plan.type, "LIMIT");
  assert.equal(accepted.plan.timeInForce, "GTX");
  assert.equal(accepted.plan.reduceOnly, false);
  assert.equal(accepted.cleanupRequired, true);
  assert.equal(accepted.safeForRepeatedMainnetExecutions, false);
  assert.equal(accepted.reconciliationOpenOrderFound, true);
  assert.equal(accepted.readiness.persistenceCheckpointIntegrated, false);
});

test("mainnet cancel gates confirmation endpoint and valid DELETE path", async () => {
  const rest = new MockMainnetTinyRest();
  await assert.rejects(
    () => executeMainnetCancel({ config: mainnetTinyConfig(), env: {}, rest, symbol: "BTCUSDT", orderId: "123" }),
    (error: unknown) => error instanceof MainnetTinyRefusal && error.reason === "MAINNET_CANCEL_CONFIRMATION_missing"
  );
  assert.equal(rest.cancelOrderCalls, 0);

  await assert.rejects(
    () => executeMainnetCancel({
      config: mainnetTinyConfig({ binanceFuturesRestUrl: "https://demo-fapi.binance.com" }),
      env: { MAINNET_CANCEL_CONFIRMATION: "I_ACCEPT_CANCEL_REAL_MONEY_ORDER" },
      rest,
      symbol: "BTCUSDT",
      orderId: "123"
    }),
    (error: unknown) => error instanceof MainnetTinyRefusal && error.reason === "mainnet_rest_endpoint_required"
  );
  assert.equal(rest.cancelOrderCalls, 0);

  const accepted = await executeMainnetCancel({
    config: mainnetTinyConfig(),
    env: { MAINNET_CANCEL_CONFIRMATION: "I_ACCEPT_CANCEL_REAL_MONEY_ORDER" },
    rest,
    symbol: "ETHUSDT",
    orderId: "123"
  });
  assert.equal(accepted.result, "MAINNET_CANCEL_SENT");
  assert.equal(rest.cancelOrderCalls, 1);
});
