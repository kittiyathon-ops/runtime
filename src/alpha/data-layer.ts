/**
 * Alpha Lab Data Layer
 *
 * Multi-timeframe dataset builder for alpha research pipeline.
 * NOT part of the production runtime execution path.
 */

import type { AlphaDataConfig } from "./alpha-config.js";

export interface AlphaCandle {
  readonly timestampMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly timeframe: string;
  readonly symbol: string;
}

export class MultiTimeframeDataset {
  private readonly data = new Map<string, readonly AlphaCandle[]>();
  readonly symbols: readonly string[];
  readonly timeframes: readonly string[];
  readonly generatedAt: number;

  constructor(
    data: ReadonlyMap<string, readonly AlphaCandle[]>,
    symbols: readonly string[],
    timeframes: readonly string[],
    generatedAt: number
  ) {
    for (const [key, candles] of data) {
      this.data.set(key, candles);
    }
    this.symbols = symbols;
    this.timeframes = timeframes;
    this.generatedAt = generatedAt;
  }

  get(key: string): readonly AlphaCandle[] | undefined {
    return this.data.get(key);
  }
}

export class DataLayer {
  constructor(private readonly config: AlphaDataConfig) {}

  buildMultiTimeframeDataset(): MultiTimeframeDataset {
    const data = new Map<string, readonly AlphaCandle[]>();

    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        const key = `${symbol}_${timeframe}`;
        data.set(key, []);
      }
    }

    return new MultiTimeframeDataset(
      data,
      [...this.config.symbols],
      [...this.config.timeframes],
      0
    );
  }
}