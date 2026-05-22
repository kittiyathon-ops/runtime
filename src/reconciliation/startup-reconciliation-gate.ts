import {
  evaluateDeterministicUncertainty,
  type DeterministicUncertaintyInput,
  type ReconciliationReport
} from "./deterministic-uncertainty-manager.js";

export type StartupReconciliationDecision =
  | "CERTIFIED_SAFE_TO_TRADE"
  | "GOVERNANCE_HALT";

export interface StartupReconciliationGateInput extends DeterministicUncertaintyInput {
  readonly startupSnapshotId: string;
}

export interface StartupReconciliationGateResult {
  readonly certified: boolean;
  readonly decision: StartupReconciliationDecision;
  readonly startupSnapshotId: string;
  readonly report: ReconciliationReport;
  readonly governanceGate: "ALLOW_STARTUP_TRADING" | "BLOCK_STARTUP_TRADING";
  readonly recommendedOperatorAction: string;
  readonly integrationPoints: readonly string[];
}

export function evaluateStartupReconciliationGate(
  input: StartupReconciliationGateInput
): StartupReconciliationGateResult {
  const report = evaluateDeterministicUncertainty(input);
  const certified = report.state === "SAFE_TO_TRADE" && report.action === "ALLOW";

  return {
    certified,
    decision: certified ? "CERTIFIED_SAFE_TO_TRADE" : "GOVERNANCE_HALT",
    startupSnapshotId: input.startupSnapshotId,
    report,
    governanceGate: certified ? "ALLOW_STARTUP_TRADING" : "BLOCK_STARTUP_TRADING",
    recommendedOperatorAction: certified
      ? "startup_truth_certified_safe_to_trade"
      : "startup_truth_not_certified_enter_governance_halt",
    integrationPoints: [
      "startup_preflight",
      "interval_reconciliation",
      "post_order_verification",
      "post_fill_verification",
      "post_restart_verification",
      "operator_reconcile_now_command"
    ]
  };
}
