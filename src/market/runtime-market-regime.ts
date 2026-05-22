export type RuntimeMarketRegime =
  | "NORMAL"
  | "PASSIVE"
  | "THROTTLED"
  | "HALTED"
  | "GOVERNANCE_HALT";

export interface RuntimeExecutionConstraints {
  readonly allowNewOrders: boolean;

  readonly allowAggressiveExecution: boolean;

  readonly passiveOnly: boolean;

  readonly reduceOnly: boolean;

  readonly throttleFactor: number;

  readonly governanceEscalation:
    | "NONE"
    | "SAFE_MODE"
    | "HALT";
}

export interface RuntimeMarketRegimeReport {
  readonly regime: RuntimeMarketRegime;

  readonly survivable: boolean;

  readonly constraints: RuntimeExecutionConstraints;

  readonly reasons: readonly string[];

  readonly detectedAtMs: number;
}
