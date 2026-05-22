import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMarketStress
} from "../src/market/index.js";

test("normal market classified correctly", () => {

  const report = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2000.2,
    spreadBps: 1,
    topBidDepthUsd: 25000,
    topAskDepthUsd: 22000,
    imbalanceRatio: 0.2,
    volatilityBps: 8,
    cancelRatePerSecond: 10,
    eventLagMs: 50,
    observedAtMs: 1000
  });

  assert.equal(report.state, "NORMAL");
  assert.equal(report.executionConstraint, "ALLOW");
});

test("stale market halts execution", () => {

  const report = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2001,
    spreadBps: 5,
    topBidDepthUsd: 15000,
    topAskDepthUsd: 15000,
    imbalanceRatio: 0.1,
    volatilityBps: 5,
    cancelRatePerSecond: 20,
    eventLagMs: 5000,
    observedAtMs: 1000
  });

  assert.equal(report.state, "STALE_MARKET");
  assert.equal(report.executionConstraint, "HALT");
});

test("thin liquidity forces passive mode", () => {

  const report = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2005,
    spreadBps: 20,
    topBidDepthUsd: 1000,
    topAskDepthUsd: 900,
    imbalanceRatio: 0.2,
    volatilityBps: 10,
    cancelRatePerSecond: 15,
    eventLagMs: 100,
    observedAtMs: 1000
  });

  assert.equal(report.state, "THIN_LIQUIDITY");
  assert.equal(report.executionConstraint, "PASSIVE_ONLY");
});

test("toxic flow throttles execution", () => {

  const report = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2000.5,
    spreadBps: 2,
    topBidDepthUsd: 25000,
    topAskDepthUsd: 23000,
    imbalanceRatio: 0.95,
    volatilityBps: 70,
    cancelRatePerSecond: 40,
    eventLagMs: 100,
    observedAtMs: 1000
  });

  assert.equal(report.state, "TOXIC_FLOW");
  assert.equal(report.executionConstraint, "THROTTLE");
});

test("cancel storm classified as chaotic", () => {

  const report = evaluateMarketStress({
    symbol: "ETHUSDT",
    bestBid: 2000,
    bestAsk: 2000.5,
    spreadBps: 2,
    topBidDepthUsd: 25000,
    topAskDepthUsd: 23000,
    imbalanceRatio: 0.3,
    volatilityBps: 10,
    cancelRatePerSecond: 500,
    eventLagMs: 100,
    observedAtMs: 1000
  });

  assert.equal(report.state, "CHAOTIC");
  assert.equal(report.executionConstraint, "HALT");
});
