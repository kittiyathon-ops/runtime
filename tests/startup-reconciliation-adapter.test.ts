import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateStartupReconciliationAdapter
} from "../src/reconciliation/index.js";

test("adapter certifies safe startup when both layers agree", () => {
  const result = evaluateStartupReconciliationAdapter({
    startupSnapshotId: "snapshot_1",
    startupDecision: {
      action: "ALLOW",
      reason: "startup_truth_reconciled",
      divergences: [],
      evidenceIds: ["ev1"]
    },
    uncertaintyInput: {
      symbol: "BTCUSDT",
      traceId: "trace_adapter_1",
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
      updateIdGap: false
    }
  });

  assert.equal(result.certifiedSafeToTrade, true);
  assert.equal(result.governanceRecommendation, "ALLOW_STARTUP_TRADING");
});

test("adapter escalates startup position mismatch into deterministic veto", () => {
  const result = evaluateStartupReconciliationAdapter({
    startupSnapshotId: "snapshot_2",
    startupDecision: {
      action: "GOVERNANCE_HALT",
      reason: "startup_truth_diverged",
      divergences: [
        {
          kind: "position_mismatch",
          reason: "startup_position_mismatch"
        }
      ],
      evidenceIds: ["ev2"]
    },
    uncertaintyInput: {
      symbol: "BTCUSDT",
      traceId: "trace_adapter_2",
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
      positionBalanceMatch: false,
      eventsMonotonic: true,
      noEventGap: true,
      delayedEventWithinTolerance: false,
      updateIdGap: false
    }
  });

  assert.equal(result.certifiedSafeToTrade, false);
  assert.equal(
    result.deterministicGate.report.state,
    "POSITION_MISMATCH"
  );
});

test("adapter escalates orphan local order into governance halt", () => {
  const result = evaluateStartupReconciliationAdapter({
    startupSnapshotId: "snapshot_3",
    startupDecision: {
      action: "GOVERNANCE_HALT",
      reason: "startup_truth_diverged",
      divergences: [
        {
          kind: "orphan_local_order",
          reason: "replay_order_missing_from_exchange"
        }
      ],
      evidenceIds: ["ev3"]
    },
    uncertaintyInput: {
      symbol: "BTCUSDT",
      traceId: "trace_adapter_3",
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
      openOrdersMatch: false,
      positionBalanceMatch: true,
      eventsMonotonic: true,
      noEventGap: true,
      delayedEventWithinTolerance: false,
      updateIdGap: false
    }
  });

  assert.equal(result.certifiedSafeToTrade, false);
  assert.equal(
    result.deterministicGate.report.state,
    "GOVERNANCE_HALT"
  );
});
