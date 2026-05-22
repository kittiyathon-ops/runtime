import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveRuntimeExecutionAuthority
} from "../src/runtime/index.js";

test("full authority granted in healthy runtime", () => {

  const report = deriveRuntimeExecutionAuthority({
    governanceState: "NORMAL",
    reconciliationState: "SAFE_TO_TRADE",
    marketRegime: "NORMAL"
  });

  assert.equal(report.authorityLevel, "FULL");
  assert.equal(report.allowAggressiveExecution, true);
});

test("market throttle forces passive execution", () => {

  const report = deriveRuntimeExecutionAuthority({
    governanceState: "NORMAL",
    reconciliationState: "SAFE_TO_TRADE",
    marketRegime: "THROTTLED"
  });

  assert.equal(report.authorityLevel, "PASSIVE_ONLY");
  assert.equal(report.passiveOnly, true);
});

test("reconciliation divergence blocks new orders", () => {

  const report = deriveRuntimeExecutionAuthority({
    governanceState: "NORMAL",
    reconciliationState: "REST_WS_DIVERGENCE",
    marketRegime: "NORMAL"
  });

  assert.equal(report.authorityLevel, "REDUCE_ONLY");
  assert.equal(report.allowNewOrders, false);
});

test("governance halt fully halts runtime", () => {

  const report = deriveRuntimeExecutionAuthority({
    governanceState: "GOVERNANCE_HALT",
    reconciliationState: "SAFE_TO_TRADE",
    marketRegime: "NORMAL"
  });

  assert.equal(report.authorityLevel, "HALTED");
  assert.equal(report.haltRuntime, true);
});
