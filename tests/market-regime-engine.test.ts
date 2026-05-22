import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMarketStress,
  deriveRuntimeMarketRegime
} from "../src/market/index.js";

test("normal market allows aggressive execution", () => {

  const stress = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2000.2,
    spreadBps: 1,
    topBidDepthUsd: 20000,
    topAskDepthUsd: 21000,
    imbalanceRatio: 0.1,
    volatilityBps: 5,
    cancelRatePerSecond: 10,
    eventLagMs: 50,
    observedAtMs: 1000
  });

  const regime = deriveRuntimeMarketRegime(stress);

  assert.equal(regime.regime, "NORMAL");
  assert.equal(regime.constraints.allowAggressiveExecution, true);
});

test("thin liquidity forces passive execution", () => {

  const stress = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2006,
    spreadBps: 20,
    topBidDepthUsd: 1000,
    topAskDepthUsd: 1000,
    imbalanceRatio: 0.2,
    volatilityBps: 10,
    cancelRatePerSecond: 20,
    eventLagMs: 50,
    observedAtMs: 1000
  });

  const regime = deriveRuntimeMarketRegime(stress);

  assert.equal(regime.regime, "PASSIVE");
  assert.equal(regime.constraints.passiveOnly, true);
});

test("stale market halts new orders", () => {

  const stress = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2001,
    spreadBps: 5,
    topBidDepthUsd: 20000,
    topAskDepthUsd: 20000,
    imbalanceRatio: 0.1,
    volatilityBps: 5,
    cancelRatePerSecond: 10,
    eventLagMs: 5000,
    observedAtMs: 1000
  });

  const regime = deriveRuntimeMarketRegime(stress);

  assert.equal(regime.regime, "HALTED");
  assert.equal(regime.constraints.allowNewOrders, false);
});

test("chaotic market escalates governance halt", () => {

  const stress = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2001,
    spreadBps: 5,
    topBidDepthUsd: 20000,
    topAskDepthUsd: 20000,
    imbalanceRatio: 0.1,
    volatilityBps: 5,
    cancelRatePerSecond: 500,
    eventLagMs: 100,
    observedAtMs: 1000
  });

  const regime = deriveRuntimeMarketRegime(stress);

  assert.equal(regime.regime, "GOVERNANCE_HALT");
  assert.equal(
    regime.constraints.governanceEscalation,
    "HALT"
  );
});
