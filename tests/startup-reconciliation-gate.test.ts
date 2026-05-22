import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateStartupReconciliationGate,
  type StartupReconciliationGateInput
} from "../src/reconciliation/index.js";

function safeStartupInput(overrides: Partial<StartupReconciliationGateInput> = {}): StartupReconciliationGateInput {
  return {
    startupSnapshotId: "startup_snapshot_1",
    symbol: "BTCUSDT",
    traceId: "trace_startup_reconcile_1",
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
    evidenceIds: ["ev_startup_reconcile_1"],
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

test("startup gate certifies only SAFE_TO_TRADE plus ALLOW", () => {
  const result = evaluateStartupReconciliationGate(safeStartupInput());

  assert.equal(result.certified, true);
  assert.equal(result.decision, "CERTIFIED_SAFE_TO_TRADE");
  assert.equal(result.governanceGate, "ALLOW_STARTUP_TRADING");
  assert.equal(result.report.state, "SAFE_TO_TRADE");
  assert.equal(result.report.action, "ALLOW");
});

test("startup gate blocks uncertainty even when not hard halted", () => {
  const result = evaluateStartupReconciliationGate(safeStartupInput({
    updateIdGap: true,
    divergences: ["update_id_gap"]
  }));

  assert.equal(result.certified, false);
  assert.equal(result.decision, "GOVERNANCE_HALT");
  assert.equal(result.governanceGate, "BLOCK_STARTUP_TRADING");
  assert.equal(result.report.state, "AWAITING_CONFIRMATION");
});

test("startup gate blocks missing exchange REST state", () => {
  const result = evaluateStartupReconciliationGate(safeStartupInput({
    restTruth: { present: false }
  }));

  assert.equal(result.certified, false);
  assert.equal(result.decision, "GOVERNANCE_HALT");
  assert.equal(result.report.state, "GOVERNANCE_HALT");
  assert.ok(result.report.hardVetoes.includes("missing_exchange_rest_state_in_live_mode"));
});

test("startup gate blocks position mismatch", () => {
  const result = evaluateStartupReconciliationGate(safeStartupInput({
    positionAmountMismatch: true,
    positionBalanceMatch: false,
    divergences: ["position_amount_mismatch"]
  }));

  assert.equal(result.certified, false);
  assert.equal(result.decision, "GOVERNANCE_HALT");
  assert.equal(result.report.state, "POSITION_MISMATCH");
});

test("startup gate output is deterministic for identical input", () => {
  const input = safeStartupInput({
    reconnectAgeMs: 10_000
  });

  assert.deepEqual(
    evaluateStartupReconciliationGate(input),
    evaluateStartupReconciliationGate(input)
  );
});

test("startup gate exposes recommended integration points without wiring live execution", () => {
  const result = evaluateStartupReconciliationGate(safeStartupInput());

  assert.deepEqual(result.integrationPoints, [
    "startup_preflight",
    "interval_reconciliation",
    "post_order_verification",
    "post_fill_verification",
    "post_restart_verification",
    "operator_reconcile_now_command"
  ]);
});

test("startup gate has no Date.now timers exchange mutation or auto cancel", () => {
  const source = readFileSync("src/reconciliation/startup-reconciliation-gate.ts", "utf8");

  assert.equal(source.includes("Date.now"), false);
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("setTimeout"), false);
  assert.equal(source.includes("cancelOrder"), false);
  assert.equal(source.includes("cancelAll"), false);
  assert.equal(source.includes("newOrder"), false);
});
