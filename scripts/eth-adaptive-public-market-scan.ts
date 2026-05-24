import { EthAdaptiveStrategy } from "../src/strategies/eth-adaptive-strategy.js";

type Kline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string
];

async function getKlines(symbol: string): Promise<Kline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=30`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${symbol}_KLINES_FAILED_${res.status}`);
  return await res.json() as Kline[];
}

async function getSpreadBps(symbol: string): Promise<number> {
  const url = `https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${symbol}_BOOK_FAILED_${res.status}`);

  const data = await res.json() as { bidPrice: string; askPrice: string };
  const bid = Number(data.bidPrice);
  const ask = Number(data.askPrice);
  const mid = (bid + ask) / 2;

  return ((ask - bid) / mid) * 10000;
}

function close(k: Kline): number {
  return Number(k[4]);
}

function high(k: Kline): number {
  return Number(k[2]);
}

function low(k: Kline): number {
  return Number(k[3]);
}

function open(k: Kline): number {
  return Number(k[1]);
}

function volume(k: Kline): number {
  return Number(k[5]);
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trend(klines: Kline[]): "LONG" | "SHORT" | "NEUTRAL" {
  const recent = klines.slice(-8).map(close);
  const older = klines.slice(-21).map(close);

  const fast = avg(recent);
  const slow = avg(older);

  if (fast > slow) return "LONG";
  if (fast < slow) return "SHORT";
  return "NEUTRAL";
}

function wickRatio(k: Kline): number {
  const range = high(k) - low(k);
  if (range <= 0) return 0;

  const body = Math.abs(close(k) - open(k));
  return (range - body) / range;
}

function volatilityBps(klines: Kline[]): number {
  const recent = klines.slice(-10);
  const h = Math.max(...recent.map(high));
  const l = Math.min(...recent.map(low));
  const c = close(recent[recent.length - 1]);

  return ((h - l) / c) * 10000;
}

const [eth, btc, spreadBps] = await Promise.all([
  getKlines("ETHUSDT"),
  getKlines("BTCUSDT"),
  getSpreadBps("ETHUSDT")
]);

const latest = eth[eth.length - 1];
const previous = eth.slice(-21, -1);

if (!latest) throw new Error("NO_ETH_LATEST_KLINE");

const ethPrice = close(latest);
const ethVolume = volume(latest);
const avgVolume = avg(previous.map(volume));

const prevHigh = Math.max(...previous.map(high));
const prevLow = Math.min(...previous.map(low));

const liquiditySweep =
  low(latest) < prevLow || high(latest) > prevHigh;

const reclaimDetected =
  close(latest) > prevLow && close(latest) < prevHigh;

const strategy = new EthAdaptiveStrategy();

const decision = strategy.evaluate({
  ethPrice,
  btcPrice: close(btc[btc.length - 1]),
  ethVolume,
  avgVolume,
  spreadBps,
  volatilityBps: volatilityBps(eth),
  wickRatio: wickRatio(latest),
  breakoutDetected: close(latest) > prevHigh || close(latest) < prevLow,
  followThrough: ethVolume > avgVolume * 1.1,
  liquiditySweep,
  reclaimDetected,
  btcTrend: trend(btc),
  ethTrend: trend(eth),
  failedSignals: 0
}, Date.now());

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_PUBLIC_MARKET_SCAN",
  restOrderSent: false,
  usesApiKey: false,
  symbol: "ETHUSDT",
  market: {
    ethPrice,
    spreadBps,
    ethVolume,
    avgVolume,
    volatilityBps: volatilityBps(eth),
    btcTrend: trend(btc),
    ethTrend: trend(eth),
    liquiditySweep,
    reclaimDetected
  },
  decision
}, null, 2));