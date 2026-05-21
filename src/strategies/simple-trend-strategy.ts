import type {
  SignalCandidate,
  SignalContext,
  DeterministicSignalStrategy,
  SignalToIntentDecision,
} from "../signals/signal-engine.js";
import type { RuntimeEvent } from "../core/event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type SimpleTrendBias = "LONG" | "SHORT";
export type SimpleTrendOrderType = "MARKET" | "LIMIT";

export interface SimpleTrendStrategyConfig {
  readonly accountEquityUsd: string;
  readonly maxExposureUsd: string;
  readonly maxDailyLossUsd: string;
  readonly maxOrderNotionalUsd: string;
  readonly minTrendStrengthBps: string;
  readonly minQuantity: string;
  readonly quantityStepSize?: string;
  readonly orderType: SimpleTrendOrderType;
  readonly maxChildQuantity?: string;
}

export interface SimpleTrendSignalContext {
  readonly symbol: string;
  readonly bias: SimpleTrendBias;
  readonly price: string;
  readonly volume: string;
  readonly averageVolume: string;
  readonly previousSma20: string;
  readonly previousSma50: string;
  readonly currentSma20: string;
  readonly currentSma50: string;
  readonly trendStrengthBps: string;
  readonly observationSeq: number;
}

interface MarketObservation {
  readonly seq: number;
  readonly price: string;
  readonly volume: string;
}

interface SymbolState {
  readonly observations: MarketObservation[];
  lastEmittedBias?: SimpleTrendBias;
}

const SMA_FAST_PERIOD = 20;
const SMA_SLOW_PERIOD = 50;
const VOLUME_PERIOD = 20;
const MAX_OBSERVATIONS = SMA_SLOW_PERIOD + 1;
const SIGNAL_TYPE = "SIMPLE_TREND_CROSS";
const RISK_PER_TRADE = "0.01";

export class SimpleTrendFollowingStrategy implements DeterministicSignalStrategy {
  readonly id = "simple_trend_following_v1";

  private readonly symbols = new Map<string, SymbolState>();

  constructor(private readonly config: SimpleTrendStrategyConfig) {
    validateConfig(config);
  }

  evaluate(signal: RuntimeEvent, _context: SignalContext): SignalToIntentDecision {
    return this.evaluateSignal(signal);
  }

  evaluateMarketEvent(event: RuntimeEvent): SignalCandidate[] {
    const price = decimalPayload(event, ["markPrice", "price", "closePrice"]);
    const volume = decimalPayload(event, ["volume", "quantity"]);
    if (price === undefined || volume === undefined) return [];
    if (PrecisionMath.safeCompare(price, "0") <= 0 || PrecisionMath.safeCompare(volume, "0") <= 0) return [];

    const state = this.stateFor(event.symbol);
    state.observations.push({ seq: event.seq, price, volume });
    if (state.observations.length > MAX_OBSERVATIONS) state.observations.shift();
    if (state.observations.length < MAX_OBSERVATIONS) return [];

    const previous = state.observations.slice(0, -1);
    const current = state.observations;
    const previousSma20 = average(last(previous, SMA_FAST_PERIOD).map((observation) => observation.price));
    const previousSma50 = average(last(previous, SMA_SLOW_PERIOD).map((observation) => observation.price));
    const currentSma20 = average(last(current, SMA_FAST_PERIOD).map((observation) => observation.price));
    const currentSma50 = average(last(current, SMA_SLOW_PERIOD).map((observation) => observation.price));
    const averageVolume = average(last(previous, VOLUME_PERIOD).map((observation) => observation.volume));

    if (PrecisionMath.safeCompare(volume, averageVolume) <= 0) return [];

    const trendStrengthBps = bpsDistance(currentSma20, currentSma50);
    if (PrecisionMath.safeCompare(trendStrengthBps, this.config.minTrendStrengthBps) < 0) return [];

    const bias = crossover(previousSma20, previousSma50, currentSma20, currentSma50);
    if (bias === undefined) return [];
    if (state.lastEmittedBias === bias) return [];
    state.lastEmittedBias = bias;

    const context: SimpleTrendSignalContext = {
      symbol: event.symbol,
      bias,
      price,
      volume,
      averageVolume,
      previousSma20,
      previousSma50,
      currentSma20,
      currentSma50,
      trendStrengthBps,
      observationSeq: event.seq
    };

    return [{
      signalType: SIGNAL_TYPE,
      symbol: event.symbol,
      payload: {
        strategyId: this.id,
        ...context,
        ...optionalDecimalPayload(event, "currentExposureUsd"),
        ...optionalDecimalPayload(event, "dailyLossUsd")
      }
    }];
  }

  evaluateSignal(signal: RuntimeEvent): SignalToIntentDecision {
    if (signal.payload.signalType !== SIGNAL_TYPE || signal.payload.strategyId !== this.id) {
      return { allow: false, reason: "unsupported_signal_type" };
    }

    const context = parseSignalContext(signal);
    const governanceAllowed = signal.payload.governanceAllowed;
    if (governanceAllowed === false) return { allow: false, reason: "governance_restriction" };
    if (governanceAllowed !== undefined && governanceAllowed !== true) {
      return { allow: false, reason: "governance_signal_invalid" };
    }

    const currentExposureUsd = requiredDecimal(signal, "currentExposureUsd");
    const dailyLossUsd = requiredDecimal(signal, "dailyLossUsd");
    if (PrecisionMath.safeCompare(dailyLossUsd, this.config.maxDailyLossUsd) >= 0) {
      return { allow: false, reason: "max_daily_loss_reached" };
    }

    const availableExposure = PrecisionMath.subtract(this.config.maxExposureUsd, currentExposureUsd);
    if (PrecisionMath.safeCompare(availableExposure, "0") <= 0) {
      return { allow: false, reason: "max_exposure_reached" };
    }

    const riskBudgetUsd = PrecisionMath.multiply(this.config.accountEquityUsd, RISK_PER_TRADE);
    const notionalUsd = minDecimal(riskBudgetUsd, this.config.maxOrderNotionalUsd, availableExposure);
    if (PrecisionMath.safeCompare(notionalUsd, "0") <= 0) {
      return { allow: false, reason: "risk_budget_exhausted" };
    }

    const rawQuantity = PrecisionMath.divide(notionalUsd, context.price, 8);
    const quantity = this.config.quantityStepSize === undefined
      ? PrecisionMath.normalize(rawQuantity)
      : PrecisionMath.applyStepSize(rawQuantity, this.config.quantityStepSize, "floor");
    if (PrecisionMath.safeCompare(quantity, this.config.minQuantity) < 0) {
      return { allow: false, reason: "quantity_below_minimum" };
    }

    const payload: Record<string, unknown> = {
      side: context.bias === "LONG" ? "BUY" : "SELL",
      type: this.config.orderType,
      quantity,
      riskPctOfEquity: RISK_PER_TRADE,
      riskBudgetUsd,
      notionalUsd,
      maxExposureUsd: this.config.maxExposureUsd,
      maxDailyLossUsd: this.config.maxDailyLossUsd,
      strategyId: this.id,
      strategyReason: `${context.bias} SMA20/SMA50 crossover with volume confirmation`,
      confidence: confidenceFromTrend(context.trendStrengthBps, this.config.minTrendStrengthBps),
      signalContext: context,
      replayMetadata: {
        sourceSignalSeq: signal.seq,
        observationSeq: context.observationSeq,
        deterministicInputs: [
          "MARKET_TICK.price",
          "MARKET_TICK.volume_or_quantity",
          "SMA20",
          "SMA50",
          "rollingAverageVolume",
          "minTrendStrengthBps"
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
      reason: "simple_trend_intent_created"
    };
  }

  private stateFor(symbol: string): SymbolState {
    const existing = this.symbols.get(symbol);
    if (existing !== undefined) return existing;
    const created: SymbolState = { observations: [] };
    this.symbols.set(symbol, created);
    return created;
  }
}

function validateConfig(config: SimpleTrendStrategyConfig): void {
  PrecisionMath.assertDecimal(config.accountEquityUsd, "account_equity_usd");
  PrecisionMath.assertDecimal(config.maxExposureUsd, "max_exposure_usd");
  PrecisionMath.assertDecimal(config.maxDailyLossUsd, "max_daily_loss_usd");
  PrecisionMath.assertDecimal(config.maxOrderNotionalUsd, "max_order_notional_usd");
  PrecisionMath.assertDecimal(config.minTrendStrengthBps, "min_trend_strength_bps");
  PrecisionMath.assertDecimal(config.minQuantity, "min_quantity");
  if (config.quantityStepSize !== undefined) PrecisionMath.assertDecimal(config.quantityStepSize, "quantity_step_size");
  if (config.maxChildQuantity !== undefined) PrecisionMath.assertDecimal(config.maxChildQuantity, "max_child_quantity");
  if (PrecisionMath.safeCompare(config.accountEquityUsd, "0") <= 0) throw new Error("account_equity_usd_must_be_positive");
  if (PrecisionMath.safeCompare(config.maxExposureUsd, "0") <= 0) throw new Error("max_exposure_usd_must_be_positive");
  if (PrecisionMath.safeCompare(config.maxDailyLossUsd, "0") <= 0) throw new Error("max_daily_loss_usd_must_be_positive");
  if (PrecisionMath.safeCompare(config.maxOrderNotionalUsd, "0") <= 0) throw new Error("max_order_notional_usd_must_be_positive");
  if (PrecisionMath.safeCompare(config.minTrendStrengthBps, "0") < 0) throw new Error("min_trend_strength_bps_must_be_nonnegative");
  if (PrecisionMath.safeCompare(config.minQuantity, "0") <= 0) throw new Error("min_quantity_must_be_positive");
}

function decimalPayload(event: RuntimeEvent, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "string") return PrecisionMath.normalize(PrecisionMath.assertDecimal(value, key));
    if (typeof value === "number" && Number.isFinite(value)) return PrecisionMath.normalize(value.toString());
  }
  return undefined;
}

function parseSignalContext(signal: RuntimeEvent): SimpleTrendSignalContext {
  const bias = signal.payload.bias;
  if (bias !== "LONG" && bias !== "SHORT") throw new Error("simple_trend_bias_invalid");
  const symbol = typeof signal.payload.symbol === "string" ? signal.payload.symbol : signal.symbol;
  const observationSeqValue = signal.payload.observationSeq;
  if (typeof observationSeqValue !== "number" || !Number.isInteger(observationSeqValue) || observationSeqValue < 0) {
    throw new Error("simple_trend_observation_seq_invalid");
  }
  return {
    symbol,
    bias,
    price: requiredDecimal(signal, "price"),
    volume: requiredDecimal(signal, "volume"),
    averageVolume: requiredDecimal(signal, "averageVolume"),
    previousSma20: requiredDecimal(signal, "previousSma20"),
    previousSma50: requiredDecimal(signal, "previousSma50"),
    currentSma20: requiredDecimal(signal, "currentSma20"),
    currentSma50: requiredDecimal(signal, "currentSma50"),
    trendStrengthBps: requiredDecimal(signal, "trendStrengthBps"),
    observationSeq: observationSeqValue
  };
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

function last<T>(values: readonly T[], count: number): readonly T[] {
  return values.slice(values.length - count);
}

function average(values: readonly string[]): string {
  if (values.length === 0) throw new Error("average_requires_values");
  const total = values.reduce((sum, value) => PrecisionMath.add(sum, value), "0");
  return PrecisionMath.divide(total, values.length.toString(), 8);
}

function crossover(previousFast: string, previousSlow: string, currentFast: string, currentSlow: string): SimpleTrendBias | undefined {
  if (PrecisionMath.safeCompare(previousFast, previousSlow) <= 0 && PrecisionMath.safeCompare(currentFast, currentSlow) > 0) {
    return "LONG";
  }
  if (PrecisionMath.safeCompare(previousFast, previousSlow) >= 0 && PrecisionMath.safeCompare(currentFast, currentSlow) < 0) {
    return "SHORT";
  }
  return undefined;
}

function bpsDistance(left: string, right: string): string {
  const distance = PrecisionMath.abs(PrecisionMath.subtract(left, right));
  if (PrecisionMath.safeCompare(right, "0") === 0) throw new Error("trend_strength_basis_zero");
  return PrecisionMath.multiply(PrecisionMath.divide(distance, right, 8), "10000");
}

function minDecimal(first: string, ...rest: readonly string[]): string {
  return rest.reduce((minimum, value) => PrecisionMath.safeCompare(value, minimum) < 0 ? value : minimum, first);
}

function confidenceFromTrend(trendStrengthBps: string, thresholdBps: string): string {
  if (PrecisionMath.safeCompare(thresholdBps, "0") === 0) return "1";
  const ratio = PrecisionMath.divide(trendStrengthBps, thresholdBps, 4);
  return PrecisionMath.safeCompare(ratio, "1") > 0 ? "1" : ratio;
}
