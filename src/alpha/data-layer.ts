export interface AlphaCandle {
  readonly timestampMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type AlphaDataset = ReadonlyMap<string, readonly AlphaCandle[]>;

export class DataLayer {
  constructor(
    private readonly config: {
      readonly symbols: readonly string[];
      readonly timeframes: readonly string[];
    }
  ) {}

  buildMultiTimeframeDataset(): AlphaDataset {
    const entries: Array<[string, readonly AlphaCandle[]]> = [];

    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        entries.push([
          `${symbol}_${timeframe}`,
          syntheticCandles(symbol, timeframe)
        ]);
      }
    }

    return new Map(entries);
  }
}

function syntheticCandles(symbol: string, timeframe: string): readonly AlphaCandle[] {
  const seed = [...`${symbol}_${timeframe}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const candles: AlphaCandle[] = [];

  let price = 2000 + (seed % 100);

  for (let index = 0; index < 300; index += 1) {
    const wave = Math.sin((index + seed) / 12) * 3;
    const drift = index * 0.03;
    const close = price + wave + drift;
    const open = price;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;

    candles.push({
      timestampMs: 1_700_000_000_000 + index * 60_000,
      open,
      high,
      low,
      close,
      volume: 100 + ((index + seed) % 50)
    });

    price = close;
  }

  return candles;
}
