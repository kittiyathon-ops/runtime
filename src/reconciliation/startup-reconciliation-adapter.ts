import type {
  StartupTruthDecision,
  StartupTruthDivergence
} from "../core/StartupTruthReconciler.js";

import {
  evaluateStartupReconciliationGate,
  type StartupReconciliationGateResult
} from "./startup-reconciliation-gate.js";

import type {
  DeterministicUncertaintyInput
} from "./deterministic-uncertainty-manager.js";

export interface StartupReconciliationAdapterInput {
  readonly startupDecision: StartupTruthDecision;
  readonly uncertaintyInput: DeterministicUncertaintyInput;
  readonly startupSnapshotId: string;
}

export interface StartupReconciliationAdapterResult {
  readonly binaryDecision: StartupTruthDecision;
  readonly deterministicGate: StartupReconciliationGateResult;
  readonly certifiedSafeToTrade: boolean;
  readonly governanceRecommendation: "ALLOW_STARTUP_TRADING" | "BLOCK_STARTUP_TRADING";
  readonly mappedDivergences: readonly string[];
}

export function evaluateStartupReconciliationAdapter(
  input: StartupReconciliationAdapterInput
): StartupReconciliationAdapterResult {
  const mappedDivergences = mapDivergences(input.startupDecision.divergences);

  const deterministicGate = evaluateStartupReconciliationGate({
    ...input.uncertaintyInput,
    startupSnapshotId: input.startupSnapshotId,
    divergences: [
      ...(input.uncertaintyInput.divergences ?? []),
      ...mappedDivergences
    ],
    positionAmountMismatch:
      input.uncertaintyInput.positionAmountMismatch === true ||
      mappedDivergences.includes("position_mismatch"),

    localOpenOrderMissingOnExchange:
      input.uncertaintyInput.localOpenOrderMissingOnExchange === true ||
      mappedDivergences.includes("orphan_local_order")
  });

  return {
    binaryDecision: input.startupDecision,
    deterministicGate,
    certifiedSafeToTrade: deterministicGate.certified,
    governanceRecommendation: deterministicGate.governanceGate,
    mappedDivergences
  };
}

function mapDivergences(
  divergences: readonly StartupTruthDivergence[]
): string[] {
  return divergences.map((divergence) => divergence.kind);
}

