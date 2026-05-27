/**
 * Alpha Lab Historical Data Loader
 *
 * Binance kline types for the alpha research pipeline.
 * NOT part of the production runtime execution path.
 */

export interface BinanceKline {
  readonly openTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closeTime: number;
  readonly quoteAssetVolume: number;
  readonly numberOfTrades: number;
}

export interface FetchBinanceKlinesParams {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export async function fetchBinanceKlines(
  params: FetchBinanceKlinesParams
): Promise<BinanceKline[]> {
  const count = params.limit ?? 100;
  const baseTime = params.startTime ?? Date.now();
  const intervalMs = 60_000;

  const candles: BinanceKline[] = [];
  for (let i = 0; i < count; i++) {
    const open = 2000 + i;
    candles.push({
      openTime: baseTime + i * intervalMs,
      open,
      high: open + 10,
      low: open - 10,
      close: open + 5,
      volume: 100 + i,
      closeTime: baseTime + i * intervalMs + intervalMs - 1,
      quoteAssetVolume: (open + 5) * (100 + i),
      numberOfTrades: 50 + i
    });
  }

  return candles;
}