export const RECONCILIATION_STATES = [
  "SAFE_TO_TRADE",
  "AWAITING_CONFIRMATION",
  "EDGE_UNCERTAIN",
  "REST_WS_DIVERGENCE",
  "TEMPORAL_INCONSISTENCY",
  "PENDING_AMBIGUITY",
  "CANCEL_REQUIRED",
  "POSITION_MISMATCH",
  "GOVERNANCE_HALT"
] as const;

export type ReconciliationState = typeof RECONCILIATION_STATES[number];

export const RECONCILIATION_ACTIONS = [
  "ALLOW",
  "REDUCE_ONLY",
  "PASSIVE_ONLY",
  "THROTTLE",
  "CANCEL_REVIEW_REQUIRED",
  "HALT_NEW_ORDERS",
  "GOVERNANCE_HALT"
] as const;

export type ReconciliationAction = typeof RECONCILIATION_ACTIONS[number];

export interface ConfidenceRule {
  readonly id: string;
  readonly description: string;
  readonly applied: boolean;
  readonly delta: string;
}

export interface TruthSnapshot {
  readonly present: boolean;
  readonly reachable?: boolean;
  readonly fresh?: boolean;
  readonly authOk?: boolean;
  readonly openOrderIds?: readonly string[];
  readonly acceptedOrderIds?: readonly string[];
  readonly visibleOrderIds?: readonly string[];
  readonly positionAmount?: string;
  readonly balance?: string;
  readonly updateId?: number;
}

export interface DeterministicUncertaintyInput {
  readonly symbol: string;
  readonly traceId: string;
  readonly nowMs: number;
  readonly enteredAtMs: number;
  readonly liveMode: boolean;
  readonly localTruth?: TruthSnapshot;
  readonly restTruth?: TruthSnapshot;
  readonly wsTruth?: TruthSnapshot;
  readonly provisionalReality?: Record<string, unknown>;
  readonly confirmedReality?: Record<string, unknown>;
  readonly divergences?: readonly string[];
  readonly temporalAnomalies?: readonly string[];
  readonly missingEvidence?: readonly string[];
  readonly quarantinedEvidence?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly timestamp?: string;
  readonly localJournalConsistentWithRest: boolean;
  readonly openOrdersMatch: boolean;
  readonly positionBalanceMatch: boolean;
  readonly eventsMonotonic: boolean;
  readonly noEventGap: boolean;
  readonly delayedEventWithinTolerance: boolean;
  readonly updateIdGap: boolean;
  readonly reconnectAgeMs?: number;
  readonly positionAmountMismatch?: boolean;
  readonly localOpenOrderMissingOnExchange?: boolean;
  readonly acceptedOrderNotVisibleAfterTolerance?: boolean;
  readonly duplicateOrderAmbiguity?: boolean;
  readonly restAuthFailure?: boolean;
  readonly exposureCapBreach?: boolean;
  readonly unknownAmbiguity?: boolean;
}

export interface ReconciliationReport {
  readonly state: ReconciliationState;
  readonly action: ReconciliationAction;
  readonly confidenceScore: string;
  readonly confidenceBreakdown: readonly ConfidenceRule[];
  readonly uncertaintyWindowMs: number | null;
  readonly enteredAtMs: number;
  readonly nowMs: number;
  readonly remainingTtlMs: number | null;
  readonly symbol: string;
  readonly localTruth: TruthSnapshot | null;
  readonly restTruth: TruthSnapshot | null;
  readonly wsTruth: TruthSnapshot | null;
  readonly provisionalReality: Record<string, unknown>;
  readonly confirmedReality: Record<string, unknown>;
  readonly divergences: readonly string[];
  readonly temporalAnomalies: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly quarantinedEvidence: readonly string[];
  readonly hardVetoes: readonly string[];
  readonly recommendedOperatorAction: string;
  readonly governanceImpact: string;
  readonly traceId: string;
  readonly evidenceIds: readonly string[];
  readonly timestamp: string;
}

const TTL_POLICY_MS: Readonly<Record<ReconciliationState, number | null>> = {
  SAFE_TO_TRADE: null,
  AWAITING_CONFIRMATION: 3000,
  EDGE_UNCERTAIN: 8000,
  REST_WS_DIVERGENCE: 5000,
  TEMPORAL_INCONSISTENCY: 4000,
  PENDING_AMBIGUITY: 2000,
  CANCEL_REQUIRED: 0,
  POSITION_MISMATCH: 0,
  GOVERNANCE_HALT: 0
};

export function reconciliationTtlMs(state: ReconciliationState): number | null {
  return TTL_POLICY_MS[state];
}

export function evaluateDeterministicUncertainty(input: DeterministicUncertaintyInput): ReconciliationReport {
  const hardVetoes = hardVetoesFor(input);
  const breakdown = confidenceBreakdownFor(input);
  const scoreBasisPoints = clampBasisPoints(
    breakdown.reduce((sum, item) => sum + decimalToBasisPoints(item.delta), 0)
  );
  const confidenceScore = basisPointsToDecimal(scoreBasisPoints);

  const initialState = classifyInitialState(input, scoreBasisPoints, hardVetoes);
  const state = escalateIfTtlExpired(initialState, input.nowMs, input.enteredAtMs);
  const action = actionForState(state);
  const ttl = reconciliationTtlMs(state);
  const elapsedMs = input.nowMs - input.enteredAtMs;
  const remainingTtlMs = ttl === null ? null : Math.max(0, ttl - elapsedMs);

  return {
    state,
    action,
    confidenceScore,
    confidenceBreakdown: breakdown,
    uncertaintyWindowMs: ttl,
    enteredAtMs: input.enteredAtMs,
    nowMs: input.nowMs,
    remainingTtlMs,
    symbol: input.symbol,
    localTruth: input.localTruth ?? null,
    restTruth: input.restTruth ?? null,
    wsTruth: input.wsTruth ?? null,
    provisionalReality: input.provisionalReality ?? {},
    confirmedReality: input.confirmedReality ?? {},
    divergences: input.divergences ?? [],
    temporalAnomalies: input.temporalAnomalies ?? [],
    missingEvidence: input.missingEvidence ?? [],
    quarantinedEvidence: input.quarantinedEvidence ?? [],
    hardVetoes,
    recommendedOperatorAction: recommendedOperatorActionFor(state),
    governanceImpact: governanceImpactFor(state),
    traceId: input.traceId,
    evidenceIds: input.evidenceIds ?? [],
    timestamp: input.timestamp ?? String(input.nowMs)
  };
}

function confidenceBreakdownFor(input: DeterministicUncertaintyInput): readonly ConfidenceRule[] {
  const restReachableAndFresh =
    input.restTruth?.present === true &&
    input.restTruth.reachable === true &&
    input.restTruth.fresh === true;

  const wsFresh =
    input.wsTruth?.present === true &&
    input.wsTruth.fresh === true;

  const reconnectWithin30s =
    input.reconnectAgeMs !== undefined &&
    input.reconnectAgeMs >= 0 &&
    input.reconnectAgeMs <= 30000;

  const positiveRules = [
    rule("rest_reachable_fresh", "REST reachable and fresh", restReachableAndFresh, 30),
    rule("ws_fresh", "WS fresh", wsFresh, 25),
    rule("local_journal_consistent_with_rest", "Local journal consistent with REST", input.localJournalConsistentWithRest, 20),
    rule("no_open_order_mismatch", "No open order mismatch", input.openOrdersMatch, 15),
    rule("no_position_balance_mismatch", "No position/balance mismatch", input.positionBalanceMatch, 20),
    rule("events_monotonic_no_gap", "Events monotonic and no gap", input.eventsMonotonic && input.noEventGap, 10)
  ];

  const positiveTotal = positiveRules.reduce((sum, item) => sum + decimalToBasisPoints(item.delta), 0);
  const positiveCapPenalty = Math.max(0, positiveTotal - 100);

  return [
    ...positiveRules,
    rule("positive_score_cap", "Positive confidence is capped at 1.00 before penalties", positiveCapPenalty > 0, -positiveCapPenalty),
    rule("delayed_event_within_tolerance", "Delayed event within tolerance", input.delayedEventWithinTolerance, -15),
    rule("update_id_gap", "UpdateId gap", input.updateIdGap, -25),
    rule("reconnect_within_last_30s", "Reconnect within last 30s", reconnectWithin30s, -20)
  ];
}

function rule(id: string, description: string, applied: boolean, deltaBasisPoints: number): ConfidenceRule {
  return {
    id,
    description,
    applied,
    delta: applied ? basisPointsToDecimal(deltaBasisPoints) : "0.00"
  };
}

function hardVetoesFor(input: DeterministicUncertaintyInput): readonly string[] {
  const vetoes: string[] = [];

  if (input.liveMode && input.restTruth?.present !== true) vetoes.push("missing_exchange_rest_state_in_live_mode");
  if (input.liveMode && input.localTruth?.present !== true) vetoes.push("missing_local_live_state");
  if (input.positionAmountMismatch === true) vetoes.push("position_amount_mismatch");
  if (input.localOpenOrderMissingOnExchange === true) vetoes.push("local_open_order_exists_but_exchange_does_not");
  if (input.acceptedOrderNotVisibleAfterTolerance === true) vetoes.push("accepted_order_not_visible_after_tolerance");
  if (input.duplicateOrderAmbiguity === true) vetoes.push("duplicate_order_ambiguity");
  if (input.restAuthFailure === true || input.restTruth?.authOk === false) vetoes.push("rest_auth_failure");
  if (input.exposureCapBreach === true) vetoes.push("exposure_cap_breach");

  return vetoes;
}

function classifyInitialState(
  input: DeterministicUncertaintyInput,
  scoreBasisPoints: number,
  hardVetoes: readonly string[]
): ReconciliationState {
  if (hardVetoes.includes("position_amount_mismatch")) return "POSITION_MISMATCH";
  if (hardVetoes.length > 0) return "GOVERNANCE_HALT";

  if ((input.temporalAnomalies ?? []).length > 0) return "TEMPORAL_INCONSISTENCY";
  if (input.unknownAmbiguity === true || (input.missingEvidence ?? []).includes("unknown_ambiguity")) return "PENDING_AMBIGUITY";

  const hasDivergence = (input.divergences ?? []).length > 0;

  if (scoreBasisPoints >= 85 && !hasDivergence) return "SAFE_TO_TRADE";
  if (scoreBasisPoints >= 60) return "AWAITING_CONFIRMATION";
  if (scoreBasisPoints >= 40) return "EDGE_UNCERTAIN";
  if (hasDivergence || input.restTruth?.fresh === false || input.wsTruth?.fresh === false) return "REST_WS_DIVERGENCE";

  return "PENDING_AMBIGUITY";
}

function escalateIfTtlExpired(state: ReconciliationState, nowMs: number, enteredAtMs: number): ReconciliationState {
  const ttl = reconciliationTtlMs(state);
  if (ttl === null || ttl === 0) return state;

  const elapsedMs = nowMs - enteredAtMs;
  if (elapsedMs <= ttl) return state;

  if (state === "AWAITING_CONFIRMATION") return "REST_WS_DIVERGENCE";
  if (state === "EDGE_UNCERTAIN") return "REST_WS_DIVERGENCE";
  if (state === "REST_WS_DIVERGENCE") return "GOVERNANCE_HALT";
  if (state === "TEMPORAL_INCONSISTENCY") return "GOVERNANCE_HALT";
  if (state === "PENDING_AMBIGUITY") return "GOVERNANCE_HALT";

  return state;
}

function actionForState(state: ReconciliationState): ReconciliationAction {
  if (state === "SAFE_TO_TRADE") return "ALLOW";
  if (state === "AWAITING_CONFIRMATION") return "THROTTLE";
  if (state === "EDGE_UNCERTAIN") return "PASSIVE_ONLY";
  if (state === "REST_WS_DIVERGENCE") return "HALT_NEW_ORDERS";
  if (state === "TEMPORAL_INCONSISTENCY") return "HALT_NEW_ORDERS";
  if (state === "PENDING_AMBIGUITY") return "HALT_NEW_ORDERS";
  if (state === "CANCEL_REQUIRED") return "CANCEL_REVIEW_REQUIRED";
  if (state === "POSITION_MISMATCH") return "GOVERNANCE_HALT";
  return "GOVERNANCE_HALT";
}

function recommendedOperatorActionFor(state: ReconciliationState): string {
  if (state === "SAFE_TO_TRADE") return "no_operator_action_required";
  if (state === "AWAITING_CONFIRMATION") return "wait_for_confirmation_or_run_reconcile_now";
  if (state === "EDGE_UNCERTAIN") return "inspect_edge_stream_and_refresh_exchange_snapshot";
  if (state === "REST_WS_DIVERGENCE") return "halt_new_orders_and_compare_rest_ws_local_truth";
  if (state === "TEMPORAL_INCONSISTENCY") return "inspect_event_ordering_and_clock_source";
  if (state === "PENDING_AMBIGUITY") return "collect_missing_evidence_before_execution";
  if (state === "CANCEL_REQUIRED") return "manual_cancel_review_required";
  if (state === "POSITION_MISMATCH") return "manual_position_reconciliation_required";
  return "operator_governance_review_required";
}

function governanceImpactFor(state: ReconciliationState): string {
  if (state === "SAFE_TO_TRADE") return "none";
  if (state === "AWAITING_CONFIRMATION") return "defer_aggressive_execution";
  if (state === "EDGE_UNCERTAIN") return "prefer_passive_only";
  if (state === "REST_WS_DIVERGENCE") return "halt_new_orders";
  if (state === "TEMPORAL_INCONSISTENCY") return "halt_new_orders_until_temporal_integrity_restored";
  if (state === "PENDING_AMBIGUITY") return "halt_new_orders_until_evidence_complete";
  if (state === "CANCEL_REQUIRED") return "manual_cancel_review_required";
  return "governance_halt";
}

function clampBasisPoints(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function basisPointsToDecimal(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function decimalToBasisPoints(value: string): number {
  const negative = value.startsWith("-");
  const normalized = negative ? value.slice(1) : value;
  const [wholeRaw = "0", fractionalRaw = "0"] = normalized.split(".");
  const whole = Number.parseInt(wholeRaw, 10);
  const fractional = Number.parseInt(fractionalRaw.padEnd(2, "0").slice(0, 2), 10);
  const result = whole * 100 + fractional;
  return negative ? -result : result;
}
