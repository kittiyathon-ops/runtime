import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateDeterministicUncertainty,
  type DeterministicUncertaintyInput
} from "../src/reconciliation/index.js";

function safeInput(overrides: Partial<DeterministicUncertaintyInput> = {}): DeterministicUncertaintyInput {
  return {
    symbol: "BTCUSDT",
    traceId: "trace_reconcile_1",
    nowMs: 10_000,
    enteredAtMs: 10_000,
    liveMode: true,
    localTruth: {
      present: true,
      openOrderIds: [],
      acceptedOrderIds: [],
      visibleOrderIds: [],
      positionAmount: "0.000",
      balance: "100.00"
    },
    restTruth: {
      present: true,
      reachable: true,
      fresh: true,
      authOk: true,
      openOrderIds: [],
      visibleOrderIds: [],
      positionAmount: "0.000",
      balance: "100.00"
    },
    wsTruth: {
      present: true,
      fresh: true,
      updateId: 100
    },
    provisionalReality: {},
    confirmedReality: {},
    divergences: [],
    temporalAnomalies: [],
    missingEvidence: [],
    quarantinedEvidence: [],
    evidenceIds: ["ev_reconcile_1"],
    timestamp: "10000",
    localJournalConsistentWithRest: true,
    openOrdersMatch: true,
    positionBalanceMatch: true,
    eventsMonotonic: true,
    noEventGap: true,
    delayedEventWithinTolerance: false,
    updateIdGap: false,
    ...overrides
  };
}

test("same input returns identical output", () => {
  const input = safeInput();
  assert.deepEqual(evaluateDeterministicUncertainty(input), evaluateDeterministicUncertainty(input));
});

test("safe state returns SAFE_TO_TRADE and ALLOW", () => {
  const report = evaluateDeterministicUncertainty(safeInput());
  assert.equal(report.state, "SAFE_TO_TRADE");
  assert.equal(report.action, "ALLOW");
  assert.equal(report.confidenceScore, "1.00");
});

test("REST fresh but WS stale returns degraded uncertainty based on confidence", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    wsTruth: { present: true, fresh: false, updateId: 100 },
    localJournalConsistentWithRest: false,
    eventsMonotonic: false,
    noEventGap: false
  }));

  assert.equal(report.confidenceScore, "0.65");
  assert.equal(report.state, "AWAITING_CONFIRMATION");
});

test("position mismatch hard-vetoes to POSITION_MISMATCH", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    positionAmountMismatch: true,
    positionBalanceMatch: false,
    divergences: ["position_amount_mismatch"]
  }));

  assert.equal(report.state, "POSITION_MISMATCH");
  assert.equal(report.action, "GOVERNANCE_HALT");
  assert.deepEqual(report.hardVetoes, ["position_amount_mismatch"]);
});

test("missing exchange state hard-vetoes GOVERNANCE_HALT", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    restTruth: { present: false }
  }));

  assert.equal(report.state, "GOVERNANCE_HALT");
  assert.equal(report.action, "GOVERNANCE_HALT");
  assert.ok(report.hardVetoes.includes("missing_exchange_rest_state_in_live_mode"));
});

test("local ghost order hard-vetoes GOVERNANCE_HALT", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    localOpenOrderMissingOnExchange: true,
    openOrdersMatch: false,
    divergences: ["local_ghost_order"]
  }));

  assert.equal(report.state, "GOVERNANCE_HALT");
  assert.ok(report.hardVetoes.includes("local_open_order_exists_but_exchange_does_not"));
});

test("accepted order not visible after tolerance hard-vetoes GOVERNANCE_HALT", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    acceptedOrderNotVisibleAfterTolerance: true,
    divergences: ["accepted_order_not_visible"]
  }));

  assert.equal(report.state, "GOVERNANCE_HALT");
  assert.ok(report.hardVetoes.includes("accepted_order_not_visible_after_tolerance"));
});

test("updateId gap lowers score and classifies degraded state", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    updateIdGap: true,
    divergences: ["update_id_gap"]
  }));

  assert.equal(report.confidenceScore, "0.75");
  assert.equal(report.state, "AWAITING_CONFIRMATION");
  assert.equal(report.confidenceBreakdown.find((rule) => rule.id === "update_id_gap")?.delta, "-0.25");
});

test("reconnect within 30s lowers score", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    reconnectAgeMs: 20_000
  }));

  assert.equal(report.confidenceScore, "0.80");
  assert.equal(report.state, "AWAITING_CONFIRMATION");
  assert.equal(report.confidenceBreakdown.find((rule) => rule.id === "reconnect_within_last_30s")?.delta, "-0.20");
});

test("TTL not exceeded keeps uncertainty state", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    nowMs: 12_000,
    enteredAtMs: 10_000,
    updateIdGap: true,
    divergences: ["update_id_gap"]
  }));

  assert.equal(report.state, "AWAITING_CONFIRMATION");
  assert.equal(report.remainingTtlMs, 1000);
});

test("TTL exceeded escalates deterministically", () => {
  const awaiting = evaluateDeterministicUncertainty(safeInput({
    nowMs: 14_001,
    enteredAtMs: 10_000,
    updateIdGap: true,
    divergences: ["update_id_gap"]
  }));

  assert.equal(awaiting.state, "REST_WS_DIVERGENCE");

  const divergence = evaluateDeterministicUncertainty(safeInput({
    nowMs: 16_001,
    enteredAtMs: 10_000,
    restTruth: { present: true, reachable: false, fresh: false, authOk: true },
    wsTruth: { present: true, fresh: false },
    localJournalConsistentWithRest: false,
    openOrdersMatch: false,
    positionBalanceMatch: false,
    eventsMonotonic: false,
    noEventGap: false,
    divergences: ["rest_ws_divergence"]
  }));

  assert.equal(divergence.state, "GOVERNANCE_HALT");
});

test("temporal anomalies produce TEMPORAL_INCONSISTENCY unless TTL expires", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    temporalAnomalies: ["non_monotonic_event"]
  }));

  assert.equal(report.state, "TEMPORAL_INCONSISTENCY");
  assert.equal(report.action, "HALT_NEW_ORDERS");
});

test("unknown ambiguity produces PENDING_AMBIGUITY", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    unknownAmbiguity: true
  }));

  assert.equal(report.state, "PENDING_AMBIGUITY");
  assert.equal(report.remainingTtlMs, 2000);
});

test("confidence breakdown sums correctly", () => {
  const report = evaluateDeterministicUncertainty(safeInput({
    updateIdGap: true,
    reconnectAgeMs: 10_000
  }));

  const sum = report.confidenceBreakdown.reduce((total, rule) => total + Number(rule.delta), 0);
  assert.equal(sum.toFixed(2), report.confidenceScore);
});

test("no Date.now usage inside reconciliation logic", () => {
  const source = readFileSync("src/reconciliation/deterministic-uncertainty-manager.ts", "utf8");
  assert.equal(source.includes("Date.now"), false);
});

test("no timers or background loops inside reconciliation logic", () => {
  const source = readFileSync("src/reconciliation/deterministic-uncertainty-manager.ts", "utf8");
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("setTimeout"), false);
});

test("no auto-cancel or exchange mutation behavior", () => {
  const source = readFileSync("src/reconciliation/deterministic-uncertainty-manager.ts", "utf8");
  assert.equal(source.includes("cancelOrder"), false);
  assert.equal(source.includes("cancelAll"), false);
  assert.equal(source.includes("newOrder"), false);
});

