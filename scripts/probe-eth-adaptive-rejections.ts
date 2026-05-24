import { EthAdaptiveStrategy, type EthMarketSnapshot } from "../src/strategies/eth-adaptive-strategy.js";

const base: EthMarketSnapshot = {
  ethPrice: 3000,
  btcPrice: 76000,
  ethVolume: 130,
  avgVolume: 100,
  spreadBps: 3,
  volatilityBps: 90,
  wickRatio: 0.32,
  breakoutDetected: false,
  followThrough: true,
  liquiditySweep: true,
  reclaimDetected: true,
  btcTrend: "LONG",
  ethTrend: "LONG",
  failedSignals: 0
};

const cases: Record<string, EthMarketSnapshot> = {
  toxicSpread: { ...base, spreadBps: 20 },
  panicVolatility: { ...base, volatilityBps: 300 },
  highWickFakeBreakout: { ...base, breakoutDetected: true, wickRatio: 0.8 },
  noFollowThrough: { ...base, breakoutDetected: true, followThrough: false },
  weakVolume: { ...base, ethVolume: 90 },
  btcConflict: { ...base, btcTrend: "SHORT" },
  failedSignals: { ...base, failedSignals: 3 }
};

const strategy = new EthAdaptiveStrategy();
const nowMs = Date.now();

const results = Object.entries(cases).map(([name, market]) => ({
  name,
  decision: strategy.evaluate(market, nowMs)
}));

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_REJECTION_PROBE",
  nowMs,
  results
}, null, 2));