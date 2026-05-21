import type {
  DeterministicSignalStrategy,
  SignalCandidate,
  SignalContext,
  SignalToIntentDecision
} from "../signals/signal-engine.js";
import type { RuntimeEvent } from "../core/event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type TrendBias = "LONG" | "SHORT";
export type TrendSignalAction = "ENTRY" | "EXIT";
export type TrendExitReason = "TREND_REVERSAL" | "TRAILING_STOP" | "VOLATILITY_EXPANSION" | "MAX_HOLD_TIMEOUT";
export type TrendOrderType = "MARKET" | "LIMIT";

export interface SimpleTrendFollowingConfig {
  readonly accountEquityUsd: string;
  readonly maxExposureUsd: string;
  readonly maxDailyLossUsd: string;
  readonly maxOrderNotionalUsd: string;
  readonly minSmaSeparationBps: string;
  readonly minVolatilityBps: string;
  readonly maxVolatilityBps: string;
  readonly maxSpreadBps: string;
  readonly minFeedConfidence: string;
  readonly minGovernanceConfidence: string;
  readonly minSurvivabilityScore: string;
  readonly minQuantity: string;
  readonly quantityStepSize?: string;
  readonly orderType: TrendOrderType;
  readonly trailingStopBps: string;
  readonly maxHoldBars: number;
  readonly maxChildQuantity?: string;
}

export interface TrendMarketContextSnapshot {
  readonly symbol: string;
  readonly action: TrendSignalAction;
  readonly bias: TrendBias;
  readonly price: string;
  readonly volume: string;
  readonly averageVolume: string;
  readonly sma20: string;
  readonly sma50: string;
  readonly smaSeparationBps: string;
  readonly volatilityBps: string;
  readonly spreadBps: string;
  readonly feedConfidence: string;
  readonly governanceConfidence: string;
  readonly survivabilityScore: string;
  readonly exchangeStable: boolean;
  readonly observationSeq: number;
  readonly marketTimestamp: number;
  readonly exitReason?: TrendExitReason;
  readonly entryObservationSeq?: number;
  readonly barsHeld?: number;
}

interface MarketObservation {
  readonly seq: number;
  readonly price: string;
  readonly volume: string;
}

interface ActiveTradeState {
  readonly bias: TrendBias;
  readonly entryPrice: string;
  readonly entryObservationSeq: number;
  readonly entryIndex: number;
  highWatermark: string;
  lowWatermark: string;
}

interface SymbolState {
  readonly observations: MarketObservation[];
  activeTrade?: ActiveTradeState;
  lastSignalKey?: string;
}

const SMA_FAST_PERIOD = 20;
const SMA_SLOW_PERIOD = 50;
const VOLUME_PERIOD = 20;
const VOLATILITY_PERIOD = 20;
const MAX_OBSERVATIONS = SMA_SLOW_PERIOD + 1;
const SIGNAL_TYPE = "SIMPLE_TREND_FOLLOWING";
const RISK_PER_TRADE = "0.01";

export class SimpleTrendFollowingStrategy implements DeterministicSignalStrategy {
  readonly id = "simple_trend_following_operational_v1";

  private readonly symbols = new Map<string, SymbolState>();

  constructor(private readonly config: SimpleTrendFollowingConfig) {
    validateConfig(config);
  }

  evaluate(signal: RuntimeEvent, _context: SignalContext): SignalToIntentDecision {
    return this.evaluateSignal(signal);
  }

  evaluateMarketEvent(event: RuntimeEvent, _context?: SignalContext): SignalCandidate[] {
    if (event.eventType !== "MARKET_TICK") return [];
    const price = decimalPayload(event, ["markPrice", "price", "closePrice"]);
    const volume = decimalPayload(event, ["volume", "quantity"]);
    if (price === undefined || volume === undefined) return [];
    if (PrecisionMath.safeCompare(price, "0") <= 0 || PrecisionMath.safeCompare(volume, "0") <= 0) return [];

    const state = this.stateFor(event.symbol);
    state.observations.push({ seq: event.seq, price, volume });
    if (state.observations.length > MAX_OBSERVATIONS) state.observations.shift();
    if (state.observations.length < MAX_OBSERVATIONS) return [];

    const snapshot = this.marketSnapshot(event, state, price, volume);
    const exit = this.exitSignal(event, state, snapshot);
    if (exit !== undefined) return [exit];

    if (state.activeTrade !== undefined) return [];
    const entry = this.entrySignal(event, state, snapshot);
    return entry === undefined ? [] : [entry];
  }

  evaluateSignal(signal: RuntimeEvent): SignalToIntentDecision {
    if (signal.payload.signalType !== SIGNAL_TYPE || signal.payload.strategyId !== this.id) {
      return { allow: false, reason: "unsupported_signal_type" };
    }

    const context = parseSignalContext(signal);
    if (context.action === "ENTRY") return this.entryIntent(signal, context);
    return this.exitIntent(signal, context);
  }

  private entryIntent(signal: RuntimeEvent, context: TrendMarketContextSnapshot): SignalToIntentDecision {
    const governanceAllowed = signal.payload.governanceAllowed;
    if (governanceAllowed === false) return { allow: false, reason: "governance_restriction" };
    if (governanceAllowed !== undefined && governanceAllowed !== true) return { allow: false, reason: "governance_signal_invalid" };

    const currentExposureUsd = requiredDecimal(signal, "currentExposureUsd");
    const dailyLossUsd = requiredDecimal(signal, "dailyLossUsd");
    if (PrecisionMath.safeCompare(dailyLossUsd, this.config.maxDailyLossUsd) >= 0) return { allow: false, reason: "max_daily_loss_reached" };

    const availableExposure = PrecisionMath.subtract(this.config.maxExposureUsd, currentExposureUsd);
    if (PrecisionMath.safeCompare(availableExposure, "0") <= 0) return { allow: false, reason: "max_exposure_reached" };

    const riskBudgetUsd = PrecisionMath.multiply(this.config.accountEquityUsd, RISK_PER_TRADE);
    const notionalUsd = minDecimal(riskBudgetUsd, this.config.maxOrderNotionalUsd, availableExposure);
    if (PrecisionMath.safeCompare(notionalUsd, "0") <= 0) return { allow: false, reason: "risk_budget_exhausted" };

    const quantity = this.quantityFromNotional(notionalUsd, context.price);
    if (PrecisionMath.safeCompare(quantity, this.config.minQuantity) < 0) return { allow: false, reason: "quantity_below_minimum" };

    return this.intent(signal, context, {
      side: context.bias === "LONG" ? "BUY" : "SELL",
      quantity,
      reduceOnly: false,
      riskBudgetUsd,
      notionalUsd,
      reason: `${context.bias} SMA20/SMA50 trend with confirmed volume and bounded volatility`
    });
  }

  private exitIntent(signal: RuntimeEvent, context: TrendMarketContextSnapshot): SignalToIntentDecision {
    const activeQuantity = optionalDecimalPayload(signal, "activePositionQuantity");
    const quantity = activeQuantity.activePositionQuantity ?? this.config.minQuantity;
    if (PrecisionMath.safeCompare(quantity, "0") <= 0) return { allow: false, reason: "exit_quantity_invalid" };
    return this.intent(signal, context, {
      side: context.bias === "LONG" ? "SELL" : "BUY",
      quantity,
      reduceOnly: true,
      riskBudgetUsd: "0",
      notionalUsd: PrecisionMath.multiply(quantity, context.price),
      reason: `${context.exitReason ?? "EXIT"} deterministic trend exit`
    });
  }

  private intent(
    signal: RuntimeEvent,
    context: TrendMarketContextSnapshot,
    input: {
      readonly side: "BUY" | "SELL";
      readonly quantity: string;
      readonly reduceOnly: boolean;
      readonly riskBudgetUsd: string;
      readonly notionalUsd: string;
      readonly reason: string;
    }
  ): SignalToIntentDecision {
    const payload: Record<string, unknown> = {
      side: input.side,
      type: this.config.orderType,
      quantity: input.quantity,
      reduceOnly: input.reduceOnly,
      riskPctOfEquity: input.reduceOnly ? "0" : RISK_PER_TRADE,
      riskBudgetUsd: input.riskBudgetUsd,
      notionalUsd: input.notionalUsd,
      maxExposureUsd: this.config.maxExposureUsd,
      maxDailyLossUsd: this.config.maxDailyLossUsd,
      strategyId: this.id,
      strategyReason: input.reason,
      confidence: confidenceFromContext(context, this.config),
      signalMetadata: {
        signalType: SIGNAL_TYPE,
        action: context.action,
        bias: context.bias,
        exitReason: context.exitReason,
        sourceSignalSeq: signal.seq
      },
      marketContext: context,
      alphaMeasurement: {
        mae: "measured_by_StateManager",
        mfe: "measured_by_StateManager",
        fillDrift: "measured_by_StateManager",
        slippage: "measured_by_StateManager",
        signalToFillLatency: "measured_by_StateManager",
        winLossExpectancy: "measured_by_OperationalMetricsRecorder"
      },
      replayMetadata: {
        sourceSignalSeq: signal.seq,
        observationSeq: context.observationSeq,
        deterministicTimestamp: context.marketTimestamp,
        replaySafeIdentifier: `${this.id}:${context.symbol}:${context.action}:${context.observationSeq}`,
        deterministicInputs: [
          "MARKET_TICK.price",
          "MARKET_TICK.volume_or_quantity",
          "MARKET_TICK.spreadBps",
          "MARKET_TICK.feedConfidence",
          "MARKET_TICK.governanceConfidence",
          "MARKET_TICK.survivabilityScore",
          "SMA20",
          "SMA50",
          "rollingAverageVolume",
          "rollingVolatilityBps"
        ]
      }
    };
    if (this.config.maxChildQuantity !== undefined) payload.maxChildQuantity = this.config.maxChildQuantity;

    return {
      allow: true,
      intent: {
        symbol: context.symbol,
        correlationId: signal.correlationId,
        payload
      },
      reason: context.action === "ENTRY" ? "simple_trend_entry_intent_created" : "simple_trend_exit_intent_created"
    };
  }

  private entrySignal(event: RuntimeEvent, state: SymbolState, snapshot: Omit<TrendMarketContextSnapshot, "action" | "bias">): SignalCandidate | undefined {
    const bias = trendBias(snapshot.sma20, snapshot.sma50);
    if (bias === undefined) return undefined;
    const noTradeReason = this.noTradeReason(snapshot);
    if (noTradeReason !== undefined) return undefined;
    if (PrecisionMath.safeCompare(snapshot.volume, snapshot.averageVolume) <= 0) return undefined;

    const context: TrendMarketContextSnapshot = { ...snapshot, action: "ENTRY", bias };
    const signal = this.signal(event, context);
    if (signal === undefined) return undefined;
    state.activeTrade = {
      bias,
      entryPrice: snapshot.price,
      entryObservationSeq: event.seq,
      entryIndex: state.observations.length - 1,
      highWatermark: snapshot.price,
      lowWatermark: snapshot.price
    };
    return signal;
  }

  private exitSignal(event: RuntimeEvent, state: SymbolState, snapshot: Omit<TrendMarketContextSnapshot, "action" | "bias">): SignalCandidate | undefined {
    const active = state.activeTrade;
    if (active === undefined) return undefined;
    if (PrecisionMath.safeCompare(snapshot.price, active.highWatermark) > 0) active.highWatermark = snapshot.price;
    if (PrecisionMath.safeCompare(snapshot.price, active.lowWatermark) < 0) active.lowWatermark = snapshot.price;

    const exitReason = this.exitReason(state, active, snapshot);
    if (exitReason === undefined) return undefined;

    const context: TrendMarketContextSnapshot = {
      ...snapshot,
      action: "EXIT",
      bias: active.bias,
      exitReason,
      entryObservationSeq: active.entryObservationSeq,
      barsHeld: snapshot.observationSeq - active.entryObservationSeq
    };
    const signal = this.signal(event, context);
    if (signal !== undefined) delete state.activeTrade;
    return signal;
  }

  private exitReason(
    state: SymbolState,
    active: ActiveTradeState,
    snapshot: Omit<TrendMarketContextSnapshot, "action" | "bias">
  ): TrendExitReason | undefined {
    const currentBias = trendBias(snapshot.sma20, snapshot.sma50);
    if (currentBias !== undefined && currentBias !== active.bias) return "TREND_REVERSAL";
    if (active.bias === "LONG") {
      const drawdownBps = bpsDistance(active.highWatermark, snapshot.price);
      if (PrecisionMath.safeCompare(drawdownBps, this.config.trailingStopBps) >= 0) return "TRAILING_STOP";
    } else {
      const reboundBps = bpsDistance(active.lowWatermark, snapshot.price);
      if (PrecisionMath.safeCompare(reboundBps, this.config.trailingStopBps) >= 0) return "TRAILING_STOP";
    }
    if (PrecisionMath.safeCompare(snapshot.volatilityBps, this.config.maxVolatilityBps) > 0) return "VOLATILITY_EXPANSION";
    if (snapshot.observationSeq - active.entryObservationSeq >= this.config.maxHoldBars) return "MAX_HOLD_TIMEOUT";
    return undefined;
  }

  private noTradeReason(snapshot: Omit<TrendMarketContextSnapshot, "action" | "bias">): string | undefined {
    if (PrecisionMath.safeCompare(snapshot.smaSeparationBps, this.config.minSmaSeparationBps) < 0) return "weak_trend";
    if (PrecisionMath.safeCompare(snapshot.volatilityBps, this.config.minVolatilityBps) < 0) return "volatility_too_low";
    if (PrecisionMath.safeCompare(snapshot.volatilityBps, this.config.maxVolatilityBps) > 0) return "volatility_spike";
    if (PrecisionMath.safeCompare(snapshot.spreadBps, this.config.maxSpreadBps) > 0) return "spread_too_wide";
    if (PrecisionMath.safeCompare(snapshot.feedConfidence, this.config.minFeedConfidence) < 0) return "feed_confidence_low";
    if (PrecisionMath.safeCompare(snapshot.governanceConfidence, this.config.minGovernanceConfidence) < 0) return "governance_confidence_degraded";
    if (PrecisionMath.safeCompare(snapshot.survivabilityScore, this.config.minSurvivabilityScore) < 0) return "survivability_score_low";
    if (!snapshot.exchangeStable) return "exchange_instability_detected";
    return undefined;
  }

  private marketSnapshot(
    event: RuntimeEvent,
    state: SymbolState,
    price: string,
    volume: string
  ): Omit<TrendMarketContextSnapshot, "action" | "bias"> {
    const observations = state.observations;
    const sma20 = average(last(observations, SMA_FAST_PERIOD).map((observation) => observation.price));
    const sma50 = average(last(observations, SMA_SLOW_PERIOD).map((observation) => observation.price));
    return {
      symbol: event.symbol,
      price,
      volume,
      averageVolume: average(last(observations.slice(0, -1), VOLUME_PERIOD).map((observation) => observation.volume)),
      sma20,
      sma50,
      smaSeparationBps: bpsDistance(sma20, sma50),
      volatilityBps: volatilityBps(last(observations, VOLATILITY_PERIOD + 1)),
      spreadBps: decimalPayload(event, ["spreadBps"]) ?? spreadBps(event) ?? "0",
      feedConfidence: decimalPayload(event, ["feedConfidence"]) ?? "1",
      governanceConfidence: decimalPayload(event, ["governanceConfidence"]) ?? "1",
      survivabilityScore: decimalPayload(event, ["survivabilityScore"]) ?? "100",
      exchangeStable: booleanPayload(event, "exchangeStable") ?? !booleanPayload(event, "exchangeInstabilityDetected", false),
      observationSeq: event.seq,
      marketTimestamp: event.timestamp
    };
  }

  private signal(event: RuntimeEvent, context: TrendMarketContextSnapshot): SignalCandidate | undefined {
    const key = `${context.symbol}:${context.action}:${context.bias}:${context.exitReason ?? "ENTRY"}:${context.observationSeq}`;
    const state = this.stateFor(context.symbol);
    if (state.lastSignalKey === key) return undefined;
    state.lastSignalKey = key;
    return {
      signalType: SIGNAL_TYPE,
      symbol: event.symbol,
      confidence: Number(confidenceFromContext(context, this.config)),
      payload: {
        strategyId: this.id,
        ...context,
        ...optionalDecimalPayload(event, "currentExposureUsd"),
        ...optionalDecimalPayload(event, "dailyLossUsd"),
        ...optionalDecimalPayload(event, "activePositionQuantity"),
        governanceAllowed: event.payload.governanceAllowed === undefined ? true : event.payload.governanceAllowed
      }
    };
  }

  private quantityFromNotional(notionalUsd: string, price: string): string {
    const rawQuantity = PrecisionMath.divide(notionalUsd, price, 8);
    return this.config.quantityStepSize === undefined
      ? PrecisionMath.normalize(rawQuantity)
      : PrecisionMath.applyStepSize(rawQuantity, this.config.quantityStepSize, "floor");
  }

  private stateFor(symbol: string): SymbolState {
    const existing = this.symbols.get(symbol);
    if (existing !== undefined) return existing;
    const created: SymbolState = { observations: [] };
    this.symbols.set(symbol, created);
    return created;
  }
}

function validateConfig(config: SimpleTrendFollowingConfig): void {
  for (const key of [
    "accountEquityUsd",
    "maxExposureUsd",
    "maxDailyLossUsd",
    "maxOrderNotionalUsd",
    "minSmaSeparationBps",
    "minVolatilityBps",
    "maxVolatilityBps",
    "maxSpreadBps",
    "minFeedConfidence",
    "minGovernanceConfidence",
    "minSurvivabilityScore",
    "minQuantity",
    "quantityStepSize",
    "trailingStopBps",
    "maxChildQuantity"
  ] as const) {
    const value = config[key];
    if (value !== undefined) PrecisionMath.assertDecimal(value, key);
  }
  if (!Number.isInteger(config.maxHoldBars) || config.maxHoldBars <= 0) throw new Error("max_hold_bars_invalid");
  for (const key of ["accountEquityUsd", "maxExposureUsd", "maxDailyLossUsd", "maxOrderNotionalUsd", "minQuantity", "trailingStopBps"] as const) {
    if (PrecisionMath.safeCompare(config[key], "0") <= 0) throw new Error(`${key}_must_be_positive`);
  }
}

function parseSignalContext(signal: RuntimeEvent): TrendMarketContextSnapshot {
  const action = signal.payload.action;
  const bias = signal.payload.bias;
  if (action !== "ENTRY" && action !== "EXIT") throw new Error("trend_signal_action_invalid");
  if (bias !== "LONG" && bias !== "SHORT") throw new Error("trend_signal_bias_invalid");
  const observationSeq = signal.payload.observationSeq;
  if (typeof observationSeq !== "number" || !Number.isInteger(observationSeq) || observationSeq < 0) throw new Error("trend_observation_seq_invalid");
  const exitReason = signal.payload.exitReason;
  if (exitReason !== undefined && exitReason !== "TREND_REVERSAL" && exitReason !== "TRAILING_STOP" && exitReason !== "VOLATILITY_EXPANSION" && exitReason !== "MAX_HOLD_TIMEOUT") {
    throw new Error("trend_exit_reason_invalid");
  }
  const entryObservationSeq = signal.payload.entryObservationSeq;
  const barsHeld = signal.payload.barsHeld;
  const marketTimestamp = signal.payload.marketTimestamp;
  if (typeof marketTimestamp !== "number" || !Number.isInteger(marketTimestamp) || marketTimestamp < 0) throw new Error("trend_market_timestamp_invalid");
  return {
    symbol: typeof signal.payload.symbol === "string" ? signal.payload.symbol : signal.symbol,
    action,
    bias,
    price: requiredDecimal(signal, "price"),
    volume: requiredDecimal(signal, "volume"),
    averageVolume: requiredDecimal(signal, "averageVolume"),
    sma20: requiredDecimal(signal, "sma20"),
    sma50: requiredDecimal(signal, "sma50"),
    smaSeparationBps: requiredDecimal(signal, "smaSeparationBps"),
    volatilityBps: requiredDecimal(signal, "volatilityBps"),
    spreadBps: requiredDecimal(signal, "spreadBps"),
    feedConfidence: requiredDecimal(signal, "feedConfidence"),
    governanceConfidence: requiredDecimal(signal, "governanceConfidence"),
    survivabilityScore: requiredDecimal(signal, "survivabilityScore"),
    exchangeStable: signal.payload.exchangeStable === true,
    observationSeq,
    marketTimestamp,
    ...(exitReason === undefined ? {} : { exitReason }),
    ...(typeof entryObservationSeq === "number" ? { entryObservationSeq } : {}),
    ...(typeof barsHeld === "number" ? { barsHeld } : {})
  };
}

function trendBias(sma20: string, sma50: string): TrendBias | undefined {
  const comparison = PrecisionMath.safeCompare(sma20, sma50);
  if (comparison > 0) return "LONG";
  if (comparison < 0) return "SHORT";
  return undefined;
}

function average(values: readonly string[]): string {
  if (values.length === 0) throw new Error("average_requires_values");
  return PrecisionMath.divide(values.reduce((sum, value) => PrecisionMath.add(sum, value), "0"), values.length.toString(), 8);
}

function volatilityBps(values: readonly MarketObservation[]): string {
  if (values.length < 2) return "0";
  const changes: string[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) continue;
    changes.push(bpsDistance(current.price, previous.price));
  }
  return average(changes);
}

function spreadBps(event: RuntimeEvent): string | undefined {
  const bid = decimalPayload(event, ["bidPrice", "bid"]);
  const ask = decimalPayload(event, ["askPrice", "ask"]);
  if (bid === undefined || ask === undefined) return undefined;
  if (PrecisionMath.safeCompare(ask, bid) <= 0) return undefined;
  const mid = PrecisionMath.divide(PrecisionMath.add(bid, ask), "2", 8);
  return PrecisionMath.multiply(PrecisionMath.divide(PrecisionMath.subtract(ask, bid), mid, 8), "10000");
}

function bpsDistance(left: string, right: string): string {
  if (PrecisionMath.safeCompare(right, "0") === 0) return "0";
  return PrecisionMath.multiply(PrecisionMath.divide(PrecisionMath.abs(PrecisionMath.subtract(left, right)), right, 8), "10000");
}

function confidenceFromContext(context: TrendMarketContextSnapshot, config: SimpleTrendFollowingConfig): string {
  const trendConfidence = boundedRatio(context.smaSeparationBps, config.minSmaSeparationBps);
  const volumeConfidence = boundedRatio(context.volume, context.averageVolume);
  const survivabilityConfidence = PrecisionMath.divide(context.survivabilityScore, "100", 4);
  return minDecimal("1", trendConfidence, volumeConfidence, survivabilityConfidence, context.feedConfidence, context.governanceConfidence);
}

function boundedRatio(value: string, threshold: string): string {
  if (PrecisionMath.safeCompare(threshold, "0") === 0) return "1";
  const ratio = PrecisionMath.divide(value, threshold, 4);
  return PrecisionMath.safeCompare(ratio, "1") > 0 ? "1" : ratio;
}

function minDecimal(first: string, ...rest: readonly string[]): string {
  return rest.reduce((minimum, value) => PrecisionMath.safeCompare(value, minimum) < 0 ? value : minimum, first);
}

function last<T>(values: readonly T[], count: number): readonly T[] {
  return values.slice(values.length - count);
}

function requiredDecimal(event: RuntimeEvent, key: string): string {
  const value = decimalPayload(event, [key]);
  if (value === undefined) throw new Error(`${key}_required`);
  return value;
}

function optionalDecimalPayload(event: RuntimeEvent, key: string): Record<string, string> {
  const value = decimalPayload(event, [key]);
  return value === undefined ? {} : { [key]: value };
}

function decimalPayload(event: RuntimeEvent, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "string") return PrecisionMath.normalize(PrecisionMath.assertDecimal(value, key));
    if (typeof value === "number" && Number.isFinite(value)) return PrecisionMath.normalize(value.toString());
  }
  return undefined;
}

function booleanPayload(event: RuntimeEvent, key: string, defaultValue?: boolean): boolean | undefined {
  const value = event.payload[key];
  if (typeof value === "boolean") return value;
  return defaultValue;
}
