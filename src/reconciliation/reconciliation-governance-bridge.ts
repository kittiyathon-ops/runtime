import type {
  GovernanceState,
  GovernanceTrigger
} from "../runtime/governance-state-machine.js";

import type {
  ReconciliationAction,
  ReconciliationReport,
  ReconciliationState
} from "./deterministic-uncertainty-manager.js";

export interface ReconciliationGovernanceBridgeInput {
  readonly currentGovernanceState: GovernanceState;
  readonly report: ReconciliationReport;
}

export interface ReconciliationGovernanceBridgeResult {
  readonly shouldTransition: boolean;
  readonly recommendedState: GovernanceState;
  readonly trigger: GovernanceTrigger;
  readonly reason: string;
  readonly sourceState: ReconciliationState;
  readonly sourceAction: ReconciliationAction;
  readonly mutationApplied: false;
}

export function recommendGovernanceForReconciliation(
  input: ReconciliationGovernanceBridgeInput
): ReconciliationGovernanceBridgeResult {
  const trigger = triggerForReport(input.report);
  const recommendedState = stateForReport(input.report);

  return {
    shouldTransition: recommendedState !== input.currentGovernanceState,
    recommendedState,
    trigger,
    reason: `reconciliation:${input.report.state}:${input.report.action}:${input.report.traceId}`,
    sourceState: input.report.state,
    sourceAction: input.report.action,
    mutationApplied: false
  };
}

function triggerForReport(report: ReconciliationReport): GovernanceTrigger {
  if (report.state === "POSITION_MISMATCH") return "exposure_integrity_breach";

  if (report.hardVetoes.includes("local_open_order_exists_but_exchange_does_not")) {
    return "ghost_order";
  }

  if (report.hardVetoes.includes("accepted_order_not_visible_after_tolerance")) {
    return "ghost_order";
  }

  if (report.hardVetoes.includes("missing_exchange_rest_state_in_live_mode")) {
    return "exchange_confidence_low";
  }

  if (report.hardVetoes.includes("rest_auth_failure")) {
    return "exchange_confidence_low";
  }

  if (report.hardVetoes.includes("exposure_cap_breach")) {
    return "exposure_integrity_breach";
  }

  if (report.state === "TEMPORAL_INCONSISTENCY") return "sequence_integrity_breach";
  if (report.state === "REST_WS_DIVERGENCE") return "exchange_confidence_low";
  if (report.state === "EDGE_UNCERTAIN") return "stale_feed";
  if (report.state === "AWAITING_CONFIRMATION") return "exchange_confidence_low";
  if (report.state === "PENDING_AMBIGUITY") return "exchange_confidence_low";

  return "manual";
}

function stateForReport(report: ReconciliationReport): GovernanceState {
  if (report.state === "SAFE_TO_TRADE" && report.action === "ALLOW") return "NORMAL";

  if (report.state === "EDGE_UNCERTAIN") return "SAFE_MODE";
  if (report.state === "AWAITING_CONFIRMATION") return "SAFE_MODE";

  if (report.state === "REST_WS_DIVERGENCE") return "GOVERNANCE_HALT";
  if (report.state === "TEMPORAL_INCONSISTENCY") return "GOVERNANCE_HALT";
  if (report.state === "PENDING_AMBIGUITY") return "GOVERNANCE_HALT";
  if (report.state === "POSITION_MISMATCH") return "GOVERNANCE_HALT";
  if (report.state === "CANCEL_REQUIRED") return "GOVERNANCE_HALT";
  if (report.state === "GOVERNANCE_HALT") return "GOVERNANCE_HALT";

  return "GOVERNANCE_HALT";
}
