import { EthAdaptiveStrategy } from "../src/strategies/eth-adaptive-strategy.js";

const strategy = new EthAdaptiveStrategy();

const nowMs = Date.now();

const decision = strategy.evaluate({
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
}, nowMs);

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_STRATEGY_PROBE",
  nowMs,
  decision
}, null, 2));