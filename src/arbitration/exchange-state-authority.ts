import type { AuditSink } from "../audit/audit-log.js";

export type ExchangeAuthority =
  | "LOCAL_RUNTIME_MEMORY"
  | "WEBSOCKET_ORDER_UPDATE"
  | "WEBSOCKET_FILL_EVENT"
  | "REST_ORDER_STATE"
  | "REST_ACCOUNT_BALANCE";

export const EXCHANGE_AUTHORITY_RANK: Record<ExchangeAuthority, number> = {
  LOCAL_RUNTIME_MEMORY: 1,
  WEBSOCKET_ORDER_UPDATE: 2,
  WEBSOCKET_FILL_EVENT: 3,
  REST_ORDER_STATE: 4,
  REST_ACCOUNT_BALANCE: 5
};

export type ConflictResolutionStatus = "RESOLVED" | "HALT_REQUIRED";

export interface AuthoritativeState<TState = Record<string, unknown>> {
  authority: ExchangeAuthority;
  state: TState;
  evidenceId: string;
  observedAt: number;
}

export interface ResolvedState<TState = Record<string, unknown>> {
  status: ConflictResolutionStatus;
  state: TState;
  selectedAuthority: ExchangeAuthority;
  downgradedAuthority?: ExchangeAuthority;
  reason: string;
  evidenceIds: string[];
}

const HALT_CONFLICT_KEYS = new Set(["asset", "symbol", "orderId", "orderClientId", "positionSide"]);

export function authorityForExchangeEvent(input: {
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
}): ExchangeAuthority {
  const sourceAuthority = input.payload.authority;
  if (isExchangeAuthority(sourceAuthority)) return sourceAuthority;
  if (input.payload.restEndpoint === "/account" || input.eventType === "POSITION_UPDATED") return "REST_ACCOUNT_BALANCE";
  if (input.payload.restEndpoint === "/order" || input.payload.restEndpoint === "/order/:id") return "REST_ORDER_STATE";
  if (input.eventType === "ORDER_FILLED") return "WEBSOCKET_FILL_EVENT";
  if (input.source === "binance_user_ws") return "WEBSOCKET_ORDER_UPDATE";
  return "LOCAL_RUNTIME_MEMORY";
}

export function resolveConflict<TState extends Record<string, unknown>>(
  localState: AuthoritativeState<TState>,
  exchangeState: AuthoritativeState<TState>,
  audit?: AuditSink
): ResolvedState<TState> {
  const localRank = EXCHANGE_AUTHORITY_RANK[localState.authority];
  const exchangeRank = EXCHANGE_AUTHORITY_RANK[exchangeState.authority];
  const evidenceIds = [localState.evidenceId, exchangeState.evidenceId];
  const conflicts = conflictKeys(localState.state, exchangeState.state);
  const winner = exchangeRank >= localRank ? exchangeState : localState;
  const loser = winner === exchangeState ? localState : exchangeState;

  const unresolvableKey = conflicts.find((key) => HALT_CONFLICT_KEYS.has(key));
  if (unresolvableKey !== undefined && localRank === exchangeRank) {
    const resolved: ResolvedState<TState> = {
      status: "HALT_REQUIRED",
      state: winner.state,
      selectedAuthority: winner.authority,
      downgradedAuthority: loser.authority,
      reason: `unresolvable_equal_authority_conflict:${unresolvableKey}`,
      evidenceIds
    };
    audit?.record({
      action: "EXCHANGE_STATE_CONFLICT_HALT",
      reason: resolved.reason,
      metrics: {
        localAuthority: localState.authority,
        exchangeAuthority: exchangeState.authority,
        conflictKeys: conflicts
      }
    });
    return resolved;
  }

  if (conflicts.length > 0 && loser.authority !== winner.authority) {
    audit?.record({
      action: "CONFIDENCE_DOWNGRADE",
      reason: "lower_authority_conflict",
      metrics: {
        selectedAuthority: winner.authority,
        downgradedAuthority: loser.authority,
        conflictKeys: conflicts,
        localAuthority: localState.authority,
        exchangeAuthority: exchangeState.authority
      }
    });
  }

  const resolved: ResolvedState<TState> = {
    status: "RESOLVED",
    state: winner.state,
    selectedAuthority: winner.authority,
    ...(conflicts.length === 0 ? {} : { downgradedAuthority: loser.authority }),
    reason: conflicts.length === 0 ? "states_equivalent" : "highest_exchange_authority_selected",
    evidenceIds
  };
  audit?.record({
    action: "exchange_state_conflict_resolved",
    reason: resolved.reason,
    metrics: {
      selectedAuthority: resolved.selectedAuthority,
      downgradedAuthority: resolved.downgradedAuthority,
      conflictKeys: conflicts,
      evidenceIds
    }
  });
  return resolved;
}

function isExchangeAuthority(value: unknown): value is ExchangeAuthority {
  return typeof value === "string" && value in EXCHANGE_AUTHORITY_RANK;
}

function conflictKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const conflicts: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      conflicts.push(key);
    }
  }
  return conflicts.sort();
}
