import type {
  GovernanceState
} from "../runtime/governance-state-machine.js";

import type {
  StartupTruthDecision
} from "../core/StartupTruthReconciler.js";

import {
  evaluateStartupReconciliationAdapter,
  type StartupReconciliationAdapterResult
} from "./startup-reconciliation-adapter.js";

import {
  recommendGovernanceForReconciliation,
  type ReconciliationGovernanceBridgeResult
} from "./reconciliation-governance-bridge.js";

import type {
  DeterministicUncertaintyInput
} from "./deterministic-uncertainty-manager.js";

export interface RuntimeStartupCertificationInput {
  readonly currentGovernanceState: GovernanceState;
  readonly startupSnapshotId: string;
  readonly startupDecision: StartupTruthDecision;
  readonly uncertaintyInput: DeterministicUncertaintyInput;
}

export interface RuntimeStartupCertificationResult {
  readonly certified: boolean;
  readonly runtimeTradingAuthority:
    | "CERTIFIED_FOR_STARTUP_TRADING"
    | "STARTUP_TRADING_DENIED";

  readonly adapter: StartupReconciliationAdapterResult;
  readonly governanceRecommendation: ReconciliationGovernanceBridgeResult;

  readonly finalRuntimeState:
    | "SAFE_TO_START_RUNTIME"
    | "STARTUP_GOVERNANCE_HALT";

  readonly startupSnapshotId: string;
  readonly requiresOperatorIntervention: boolean;
  readonly mutationApplied: false;
}

export function certifyRuntimeStartup(
  input: RuntimeStartupCertificationInput
): RuntimeStartupCertificationResult {

  const adapter = evaluateStartupReconciliationAdapter({
    startupSnapshotId: input.startupSnapshotId,
    startupDecision: input.startupDecision,
    uncertaintyInput: input.uncertaintyInput
  });

  const governanceRecommendation =
    recommendGovernanceForReconciliation({
      currentGovernanceState: input.currentGovernanceState,
      report: adapter.deterministicGate.report
    });

  const certified =
    adapter.certifiedSafeToTrade &&
    governanceRecommendation.recommendedState === "NORMAL";

  return {
    certified,

    runtimeTradingAuthority: certified
      ? "CERTIFIED_FOR_STARTUP_TRADING"
      : "STARTUP_TRADING_DENIED",

    adapter,
    governanceRecommendation,

    finalRuntimeState: certified
      ? "SAFE_TO_START_RUNTIME"
      : "STARTUP_GOVERNANCE_HALT",

    startupSnapshotId: input.startupSnapshotId,

    requiresOperatorIntervention: !certified,

    mutationApplied: false
  };
}
