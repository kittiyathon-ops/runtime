import type {
  BinanceKline
} from "./historical-data-loader.js";

export interface MarketFeatureVector {
  readonly timestampMs: number;
  readonly close: number;
  readonly returnPct: number;
  readonly rollingVolatilityPct: number;
  readonly momentum5: number;
  readonly meanReversionDistancePct: number;
  readonly volumeZScore: number;
}

export function extractMarketFeatures(
  candles: readonly BinanceKline[]
): readonly MarketFeatureVector[] {
  const vectors: MarketFeatureVector[] = [];
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);

  for (let index = 20; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const close5 = closes[index - 5];

    if (candle === undefined || previous === undefined || close5 === undefined) {
      continue;
    }

    const returnPct = ((candle.close - previous.close) / previous.close) * 100;
    const rollingWindow = closes.slice(index - 20, index);
    const rollingMean = mean(rollingWindow);
    const rollingStd = standardDeviation(rollingWindow);
    const momentum5 = ((candle.close - close5) / close5) * 100;
    const meanReversionDistancePct = rollingMean === 0 ? 0 : ((candle.close - rollingMean) / rollingMean) * 100;

    const volumeWindow = volumes.slice(index - 20, index);
    const volumeMean = mean(volumeWindow);
    const volumeStd = standardDeviation(volumeWindow);
    const volumeZScore = volumeStd === 0 ? 0 : (candle.volume - volumeMean) / volumeStd;

    vectors.push({
      timestampMs: candle.openTime,
      close: candle.close,
      returnPct,
      rollingVolatilityPct: rollingStd,
      momentum5,
      meanReversionDistancePct,
      volumeZScore
    });
  }

  return vectors;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}
