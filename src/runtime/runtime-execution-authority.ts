export interface RuntimeExecutionAuthorityInput {
  readonly governanceState:
    | "NORMAL"
    | "SAFE_MODE"
    | "HALTED"
    | "GOVERNANCE_HALT";

  readonly reconciliationState:
    | "SAFE_TO_TRADE"
    | "AWAITING_CONFIRMATION"
    | "EDGE_UNCERTAIN"
    | "REST_WS_DIVERGENCE"
    | "TEMPORAL_INCONSISTENCY"
    | "PENDING_AMBIGUITY"
    | "POSITION_MISMATCH"
    | "GOVERNANCE_HALT";

  readonly marketRegime:
    | "NORMAL"
    | "PASSIVE"
    | "THROTTLED"
    | "HALTED"
    | "GOVERNANCE_HALT";
}

export interface RuntimeExecutionAuthorityReport {
  readonly allowNewOrders: boolean;

  readonly allowAggressiveExecution: boolean;

  readonly passiveOnly: boolean;

  readonly reduceOnly: boolean;

  readonly haltRuntime: boolean;

  readonly authorityLevel:
    | "FULL"
    | "PASSIVE_ONLY"
    | "REDUCE_ONLY"
    | "HALTED";

  readonly reasons: readonly string[];
}

export function deriveRuntimeExecutionAuthority(
  input: RuntimeExecutionAuthorityInput
): RuntimeExecutionAuthorityReport {

  const reasons: string[] = [];

  if (
    input.governanceState === "GOVERNANCE_HALT" ||
    input.marketRegime === "GOVERNANCE_HALT" ||
    input.reconciliationState === "GOVERNANCE_HALT"
  ) {

    reasons.push("governance_halt_active");

    return {
      allowNewOrders: false,
      allowAggressiveExecution: false,
      passiveOnly: false,
      reduceOnly: true,
      haltRuntime: true,
      authorityLevel: "HALTED",
      reasons
    };
  }

  if (
    input.marketRegime === "HALTED" ||
    input.reconciliationState === "REST_WS_DIVERGENCE" ||
    input.reconciliationState === "TEMPORAL_INCONSISTENCY" ||
    input.reconciliationState === "POSITION_MISMATCH"
  ) {

    reasons.push("runtime_execution_halted");

    return {
      allowNewOrders: false,
      allowAggressiveExecution: false,
      passiveOnly: false,
      reduceOnly: true,
      haltRuntime: false,
      authorityLevel: "REDUCE_ONLY",
      reasons
    };
  }

  if (
    input.marketRegime === "THROTTLED" ||
    input.governanceState === "SAFE_MODE" ||
    input.reconciliationState === "EDGE_UNCERTAIN"
  ) {

    reasons.push("runtime_throttled");

    return {
      allowNewOrders: true,
      allowAggressiveExecution: false,
      passiveOnly: true,
      reduceOnly: false,
      haltRuntime: false,
      authorityLevel: "PASSIVE_ONLY",
      reasons
    };
  }

  if (
    input.marketRegime === "PASSIVE" ||
    input.reconciliationState === "AWAITING_CONFIRMATION" ||
    input.reconciliationState === "PENDING_AMBIGUITY"
  ) {

    reasons.push("passive_execution_only");

    return {
      allowNewOrders: true,
      allowAggressiveExecution: false,
      passiveOnly: true,
      reduceOnly: false,
      haltRuntime: false,
      authorityLevel: "PASSIVE_ONLY",
      reasons
    };
  }

  reasons.push("full_execution_authority");

  return {
    allowNewOrders: true,
    allowAggressiveExecution: true,
    passiveOnly: false,
    reduceOnly: false,
    haltRuntime: false,
    authorityLevel: "FULL",
    reasons
  };
}
