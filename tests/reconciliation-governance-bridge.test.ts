import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDeterministicUncertainty,
  recommendGovernanceForReconciliation,
  type DeterministicUncertaintyInput
} from "../src/reconciliation/index.js";

function input(overrides: Partial<DeterministicUncertaintyInput> = {}): DeterministicUncertaintyInput {
  return {
    symbol: "BTCUSDT",
    traceId: "trace_bridge_1",
    nowMs: 1000,
    enteredAtMs: 1000,
    liveMode: true,
    localTruth: { present: true },
    restTruth: {
      present: true,
      reachable: true,
      fresh: true,
      authOk: true
    },
    wsTruth: {
      present: true,
      fresh: true
    },
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

test("governance bridge keeps SAFE_TO_TRADE in NORMAL without mutation", () => {
  const report = evaluateDeterministicUncertainty(input());
  const result = recommendGovernanceForReconciliation({
    currentGovernanceState: "NORMAL",
    report
  });

  assert.equal(result.shouldTransition, false);
  assert.equal(result.recommendedState, "NORMAL");
  assert.equal(result.trigger, "manual");
  assert.equal(result.mutationApplied, false);
});

test("governance bridge maps awaiting confirmation to SAFE_MODE recommendation", () => {
  const report = evaluateDeterministicUncertainty(input({
    updateIdGap: true,
    divergences: ["update_id_gap"]
  }));

  const result = recommendGovernanceForReconciliation({
    currentGovernanceState: "NORMAL",
    report
  });

  assert.equal(report.state, "AWAITING_CONFIRMATION");
  assert.equal(result.shouldTransition, true);
  assert.equal(result.recommendedState, "SAFE_MODE");
  assert.equal(result.trigger, "exchange_confidence_low");
  assert.equal(result.mutationApplied, false);
});

test("governance bridge maps REST WS divergence to governance halt", () => {
  const report = evaluateDeterministicUncertainty(input({
    restTruth: { present: true, reachable: false, fresh: false, authOk: true },
    wsTruth: { present: true, fresh: false },
    localJournalConsistentWithRest: false,
    openOrdersMatch: false,
    positionBalanceMatch: false,
    eventsMonotonic: false,
    noEventGap: false,
    divergences: ["rest_ws_divergence"]
  }));

  const result = recommendGovernanceForReconciliation({
    currentGovernanceState: "NORMAL",
    report
  });

  assert.equal(report.state, "REST_WS_DIVERGENCE");
  assert.equal(result.recommendedState, "GOVERNANCE_HALT");
  assert.equal(result.trigger, "exchange_confidence_low");
});

test("governance bridge maps position mismatch to exposure integrity breach", () => {
  const report = evaluateDeterministicUncertainty(input({
    positionAmountMismatch: true,
    positionBalanceMatch: false,
    divergences: ["position_mismatch"]
  }));

  const result = recommendGovernanceForReconciliation({
    currentGovernanceState: "NORMAL",
    report
  });

  assert.equal(report.state, "POSITION_MISMATCH");
  assert.equal(result.recommendedState, "GOVERNANCE_HALT");
  assert.equal(result.trigger, "exposure_integrity_breach");
});

test("governance bridge is recommendation-only and does not transition state machine", () => {
  const report = evaluateDeterministicUncertainty(input({
    reconnectAgeMs: 10_000
  }));

  const result = recommendGovernanceForReconciliation({
    currentGovernanceState: "NORMAL",
    report
  });

  assert.equal(result.mutationApplied, false);
});
