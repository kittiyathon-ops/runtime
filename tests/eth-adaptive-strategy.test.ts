import test from "node:test";
import assert from "node:assert/strict";
import { EthAdaptiveStrategy } from "../src/strategies/eth-adaptive-strategy.js";

test("allows ETH long only on reclaim setup with BTC not bearish", () => {
  const strategy = new EthAdaptiveStrategy();

  const decision = strategy.evaluate({
    ethPrice: 3000,
    btcPrice: 76000,
    ethVolume: 120,
    avgVolume: 100,
    spreadBps: 3,
    volatilityBps: 90,
    wickRatio: 0.3,
    breakoutDetected: false,
    followThrough: true,
    liquiditySweep: true,
    reclaimDetected: true,
    btcTrend: "LONG",
    ethTrend: "LONG",
    failedSignals: 0
  }, 1000);

  assert.equal(decision.allowTrade, true);
  assert.equal(decision.side, "LONG");
  assert.equal(decision.reason, "VALID_ETH_RECLAIM_SETUP");
});

test("rejects fake breakout with high wick", () => {
  const strategy = new EthAdaptiveStrategy();

  const decision = strategy.evaluate({
    ethPrice: 3000,
    btcPrice: 76000,
    ethVolume: 150,
    avgVolume: 100,
    spreadBps: 3,
    volatilityBps: 90,
    wickRatio: 0.8,
    breakoutDetected: true,
    followThrough: true,
    liquiditySweep: false,
    reclaimDetected: false,
    btcTrend: "LONG",
    ethTrend: "LONG",
    failedSignals: 0
  }, 1000);

  assert.equal(decision.allowTrade, false);
  assert.equal(decision.reason, "HIGH_WICK_FAKE_BREAKOUT");
});

test("post loss cooldown blocks new trade", () => {
  const strategy = new EthAdaptiveStrategy();

  strategy.recordTradeResult(-1, 1000);
  strategy.recordTradeResult(-1, 2000);

  const decision = strategy.evaluate({
    ethPrice: 3000,
    btcPrice: 76000,
    ethVolume: 120,
    avgVolume: 100,
    spreadBps: 3,
    volatilityBps: 90,
    wickRatio: 0.3,
    breakoutDetected: false,
    followThrough: true,
    liquiditySweep: true,
    reclaimDetected: true,
    btcTrend: "LONG",
    ethTrend: "LONG",
    failedSignals: 0
  }, 3000);

  assert.equal(decision.allowTrade, false);
  assert.equal(decision.reason, "POST_LOSS_COOLDOWN");
});