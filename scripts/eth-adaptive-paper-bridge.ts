import { EthAdaptiveStrategy } from "../src/strategies/eth-adaptive-strategy.js";

const strategy = new EthAdaptiveStrategy();
const nowMs = Date.now();

const market = {
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
  btcTrend: "LONG" as const,
  ethTrend: "LONG" as const,
  failedSignals: 0
};

const decision = strategy.evaluate(market, nowMs);

const paperIntent = decision.allowTrade
  ? {
      mode: "PAPER_ONLY",
      symbol: "ETHUSDT",
      side: decision.side === "LONG" ? "BUY" : "SELL",
      confidence: decision.confidence,
      positionSizeMultiplier: decision.positionSizeMultiplier,
      reason: decision.reason,
      safety: "NO_BINANCE_REST_ORDER"
    }
  : null;

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_PAPER_BRIDGE",
  restOrderSent: false,
  decision,
  paperIntent
}, null, 2));