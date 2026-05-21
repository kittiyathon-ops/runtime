import {
  formatDailySummary,
  formatAlertAggregation,
  formatGovernanceTransition,
  formatOrderFilled,
  formatOrderSubmitted,
  formatPnlSnapshot,
  formatPositionClosed,
  formatReplayAlert,
  formatRiskLimitHit,
  formatRuntimeError,
  formatRuntimeStarted,
  formatRuntimeStopped,
  formatSafeMode,
  formatWebsocketDisconnected,
  formatWebsocketReconnecting
} from "./telegram-formatter.js";
import type { TelegramAlertPayload } from "./telegram-message-types.js";

export function buildTelegramAlert(payload: TelegramAlertPayload): string {
  switch (payload.kind) {
    case "runtime_started":
      return formatRuntimeStarted(payload, payload.language);
    case "runtime_stopped":
      return formatRuntimeStopped(payload, payload.language);
    case "safe_mode":
      return formatSafeMode(payload, payload.language);
    case "order_submitted":
      return formatOrderSubmitted(payload, payload.language);
    case "order_filled":
      return formatOrderFilled(payload, payload.language);
    case "runtime_error":
      return formatRuntimeError(payload, payload.language);
    case "risk_limit_hit":
      return formatRiskLimitHit(payload, payload.language);
    case "websocket_disconnected":
      return formatWebsocketDisconnected(payload, payload.language);
    case "websocket_reconnecting":
      return formatWebsocketReconnecting(payload, payload.language);
    case "pnl_snapshot":
      return formatPnlSnapshot(payload, payload.language);
    case "daily_summary":
      return formatDailySummary(payload, payload.language);
    case "position_closed":
      return formatPositionClosed(payload, payload.language);
    case "governance_transition":
      return formatGovernanceTransition(payload, payload.language);
    case "replay_divergence":
    case "missing_sequence":
    case "duplicate_sequence":
    case "out_of_order_sequence":
      return formatReplayAlert(payload, payload.language);
    case "alert_aggregation":
      return formatAlertAggregation(payload);
  }
}
