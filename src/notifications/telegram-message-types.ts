import type { TelegramLanguage } from "../i18n/index.js";
import type { AlertMode } from "./alert-mode.js";
import type { AlertSeverity } from "./alert-severity.js";
import type { AlertTag } from "./alert-tags.js";

export type TradeSide = "LONG" | "SHORT";
export type RuntimeAlertState = "NORMAL" | "DEGRADED" | "SAFE_MODE" | "HALTED" | "REPLAY" | "SHADOW";

export interface AlertCorrelation {
  traceId?: string;
  eventId?: string;
  orderId?: string;
  sessionId?: string;
}

export interface StructuredTelegramAlert {
  severity: AlertSeverity;
  primaryTag: AlertTag;
  secondaryTags?: AlertTag[] | undefined;
  mode?: AlertMode | undefined;
  language?: TelegramLanguage | string | undefined;
  correlation?: AlertCorrelation | undefined;
}

export interface ClosedPositionSummary extends StructuredTelegramAlert {
  symbol: string;
  side: TradeSide;
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  pnlPercent: number;
  wins: number;
  losses: number;
  totalWinUsd: number;
  totalLossUsd: number;
  sessionTotal: number;
  orderId: string | number;
  rrRatio?: number;
  holdTime?: string;
  strategyReason?: string;
  runtimeState?: RuntimeAlertState;
}

export interface RuntimeAlertSummary extends StructuredTelegramAlert {
  state?: RuntimeAlertState;
  reason?: string;
  correlationId?: string;
  seq?: number;
  profile?: string;
  symbol?: string;
  value?: number | string;
}

export interface PnlSnapshotSummary extends StructuredTelegramAlert {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  maxDrawdownUsd?: number;
  winRate?: number;
  runtimeState?: RuntimeAlertState;
}

export interface DailySummaryAlert extends StructuredTelegramAlert {
  wins: number;
  losses: number;
  totalWinUsd: number;
  totalLossUsd: number;
  sessionTotal: number;
}

export interface GovernanceTransitionAlert extends StructuredTelegramAlert {
  from: RuntimeAlertState;
  to: RuntimeAlertState;
  reason?: string;
  correlationId?: string;
}

export type ReplayAlertKind = "replay_divergence" | "missing_sequence" | "duplicate_sequence" | "out_of_order_sequence";

export interface ReplayAlert extends StructuredTelegramAlert {
  reason: string;
  seq?: number;
  expectedSeq?: number;
  receivedSeq?: number;
  gap?: number;
  eventId?: string;
  replayCursor?: number;
}

export interface AggregatedAlert extends StructuredTelegramAlert {
  fingerprint: string;
  count: number;
  windowMs: number;
  summaryKey: string;
}

export type AggregatedAlertPayload = { kind: "alert_aggregation" } & AggregatedAlert;

export type TelegramAlertPayload =
  | ({ kind: "runtime_started" } & RuntimeAlertSummary)
  | ({ kind: "runtime_stopped" } & RuntimeAlertSummary)
  | ({ kind: "safe_mode" } & RuntimeAlertSummary)
  | ({ kind: "order_submitted" } & RuntimeAlertSummary)
  | ({ kind: "order_filled" } & RuntimeAlertSummary)
  | ({ kind: "runtime_error" } & RuntimeAlertSummary)
  | ({ kind: "risk_limit_hit" } & RuntimeAlertSummary)
  | ({ kind: "websocket_disconnected" } & RuntimeAlertSummary)
  | ({ kind: "websocket_reconnecting" } & RuntimeAlertSummary)
  | ({ kind: "pnl_snapshot" } & PnlSnapshotSummary)
  | ({ kind: "daily_summary" } & DailySummaryAlert)
  | ({ kind: "position_closed" } & ClosedPositionSummary)
  | ({ kind: "governance_transition" } & GovernanceTransitionAlert)
  | ({ kind: ReplayAlertKind } & ReplayAlert)
  | AggregatedAlertPayload;
