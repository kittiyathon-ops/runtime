import test from "node:test";
import assert from "node:assert/strict";

import {
  certifyRuntimeStartup
} from "../src/reconciliation/index.js";

test("runtime startup certification approves safe startup", () => {

  const result = certifyRuntimeStartup({
    currentGovernanceState: "NORMAL",

    startupSnapshotId: "startup_cert_1",

    startupDecision: {
      action: "ALLOW",
      reason: "startup_truth_reconciled",
      divergences: [],
      evidenceIds: ["ev1"]
    },

    uncertaintyInput: {
      symbol: "ETHUSDT",
      traceId: "trace_runtime_startup_1",
      nowMs: 1000,
      enteredAtMs: 1000,
      liveMode: true,

      localTruth: {
        present: true
      },

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

  assert.equal(result.certified, true);
  assert.equal(
    result.runtimeTradingAuthority,
    "CERTIFIED_FOR_STARTUP_TRADING"
  );

  assert.equal(
    result.finalRuntimeState,
    "SAFE_TO_START_RUNTIME"
  );

  assert.equal(result.mutationApplied, false);
});

test("runtime startup certification denies degraded startup", () => {

  const result = certifyRuntimeStartup({
    currentGovernanceState: "NORMAL",

    startupSnapshotId: "startup_cert_2",

    startupDecision: {
      action: "GOVERNANCE_HALT",
      reason: "startup_truth_diverged",
      divergences: [
        {
          kind: "position_mismatch",
          reason: "exchange_position_mismatch"
        }
      ],
      evidenceIds: ["ev2"]
    },

    uncertaintyInput: {
      symbol: "ETHUSDT",
      traceId: "trace_runtime_startup_2",
      nowMs: 1000,
      enteredAtMs: 1000,
      liveMode: true,

      localTruth: {
        present: true
      },

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

      localJournalConsistentWithRest: false,
      openOrdersMatch: false,
      positionBalanceMatch: false,
      positionAmountMismatch: true,
      eventsMonotonic: true,
      noEventGap: true,
      delayedEventWithinTolerance: false,
      updateIdGap: false
    }
  });

  assert.equal(result.certified, false);

  assert.equal(
    result.runtimeTradingAuthority,
    "STARTUP_TRADING_DENIED"
  );

  assert.equal(
    result.finalRuntimeState,
    "STARTUP_GOVERNANCE_HALT"
  );

  assert.equal(
    result.governanceRecommendation.recommendedState,
    "GOVERNANCE_HALT"
  );
});

test("runtime startup certification remains recommendation only", () => {

  const result = certifyRuntimeStartup({
    currentGovernanceState: "NORMAL",

    startupSnapshotId: "startup_cert_3",

    startupDecision: {
      action: "ALLOW",
      reason: "startup_truth_reconciled",
      divergences: [],
      evidenceIds: ["ev3"]
    },

    uncertaintyInput: {
      symbol: "ETHUSDT",
      traceId: "trace_runtime_startup_3",
      nowMs: 1000,
      enteredAtMs: 1000,
      liveMode: true,

      localTruth: {
        present: true
      },

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

  assert.equal(result.mutationApplied, false);
  assert.equal(result.requiresOperatorIntervention, false);
});
