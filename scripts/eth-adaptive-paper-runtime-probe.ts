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

const canonicalPaperEvent = decision.allowTrade
  ? {
      eventType: "INTENT_CREATED",
      source: "eth_adaptive_paper_probe",
      symbol: "ETHUSDT",
      payload: {
        side: decision.side === "LONG" ? "BUY" : "SELL",
        type: "MARKET",
        confidence: decision.confidence,
        positionSizeMultiplier: decision.positionSizeMultiplier,
        reason: decision.reason,
        paperOnly: true,
        restOrderSent: false
      }
    }
  : {
      eventType: "ORDER_REJECTED",
      source: "eth_adaptive_paper_probe",
      symbol: "ETHUSDT",
      payload: {
        reason: decision.reason,
        paperOnly: true,
        restOrderSent: false
      }
    };

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_PAPER_RUNTIME_PROBE_OK",
  runtimeProfile: "PAPER",
  dryRun: true,
  restOrderSent: false,
  decision,
  canonicalPaperEvent
}, null, 2));