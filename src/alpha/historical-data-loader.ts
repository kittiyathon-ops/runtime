export interface BinanceKline {
  readonly openTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closeTime: number;
}

export interface HistoricalDatasetRequest {
  readonly symbol: string;
  readonly interval: string;
  readonly limit: number;
}

export async function fetchBinanceKlines(
  request: HistoricalDatasetRequest
): Promise<readonly BinanceKline[]> {

  const url =
    "https://fapi.binance.com/fapi/v1/klines" +
    `?symbol=${request.symbol}` +
    `&interval=${request.interval}` +
    `&limit=${request.limit}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `binance_klines_fetch_failed_${response.status}`
    );
  }

  const raw =
    await response.json() as readonly unknown[];

  return raw.map((entry) => {

    const kline = entry as readonly unknown[];

    return {
      openTime: Number(kline[0]),
      open: Number(kline[1]),
      high: Number(kline[2]),
      low: Number(kline[3]),
      close: Number(kline[4]),
      volume: Number(kline[5]),
      closeTime: Number(kline[6])
    };
  });
}
