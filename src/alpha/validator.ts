import type { AlphaCandle } from "./data-layer.js";
import type { AlphaHypothesis } from "./hypothesis-engine.js";

export interface ValidationResult {
  readonly hypothesisId: string;
  readonly passed: boolean;
  readonly metrics: {
    readonly trades: number;
    readonly sharpeRatio: number;
    readonly netExpectancyPct: number;
    readonly totalReturnPct: number;
  };
}

export class Validator {
  constructor(
    private readonly config: {
      readonly minTrades: number;
      readonly minSharpeRatio: number;
      readonly minNetExpectancyPct: number;
    }
  ) {}

  validateHypothesis(input: {
    readonly candles: readonly AlphaCandle[];
    readonly hypothesis: AlphaHypothesis;
  }): ValidationResult {
    const returns = backtestRsi(input.candles, input.hypothesis);
    const trades = returns.length;
    const avg = mean(returns);
    const std = standardDeviation(returns);
    const sharpeRatio = std === 0 ? 0 : (avg / std) * Math.sqrt(252);
    const totalReturnPct = returns.reduce((sum, item) => sum + item, 0);
    const netExpectancyPct = avg;

    const passed =
      trades >= this.config.minTrades &&
      sharpeRatio >= this.config.minSharpeRatio &&
      netExpectancyPct >= this.config.minNetExpectancyPct;

    return {
      hypothesisId: input.hypothesis.id,
      passed,
      metrics: {
        trades,
        sharpeRatio,
        netExpectancyPct,
        totalReturnPct
      }
    };
  }
}

function backtestRsi(candles: readonly AlphaCandle[], hypothesis: AlphaHypothesis): number[] {
  const rsi = computeRsi(candles.map((candle) => candle.close), hypothesis.params.rsiPeriod);
  const tradeReturns: number[] = [];

  let entryPrice: number | null = null;

  for (let index = 0; index < candles.length; index += 1) {
    const value = rsi[index];
    const close = candles[index]?.close;

    if (value === undefined || close === undefined) continue;

    if (entryPrice === null && value < hypothesis.params.buyBelow) {
      entryPrice = close;
      continue;
    }

    if (entryPrice !== null && value > hypothesis.params.exitAbove) {
      tradeReturns.push(((close - entryPrice) / entryPrice) * 100);
      entryPrice = null;
    }
  }

  return tradeReturns;
}

function computeRsi(closes: readonly number[], period: number): Array<number | undefined> {
  const result: Array<number | undefined> = [];

  for (let index = 0; index < closes.length; index += 1) {
    if (index < period) {
      result.push(undefined);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let lookback = index - period + 1; lookback <= index; lookback += 1) {
      const current = closes[lookback];
      const previous = closes[lookback - 1];
      if (current === undefined || previous === undefined) continue;

      const diff = current - previous;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    if (losses === 0) {
      result.push(100);
      continue;
    }

    const rs = gains / losses;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, item) => sum + ((item - avg) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}
