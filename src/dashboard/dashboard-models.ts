import type { AlertDashboardMetadata } from "../notifications/alert-dashboard-metadata.js";
import type { AlertCorrelation, RuntimeAlertState, TelegramAlertPayload } from "../notifications/telegram-message-types.js";
import type { ConsensusCheckResult } from "../runtime/runtime-consensus.js";
import type { PortfolioSnapshot } from "../runtime/portfolio-state-engine.js";
import type { RecoveryReport } from "../runtime/recovery-manager.js";
import type { RuntimeTimelineEntry } from "../runtime/runtime-timeline.js";

export interface DashboardTimelineEntry {
  id: number;
  timestamp: number;
  severity: string;
  type: string;
  tags: string[];
  summaryKey: string;
  correlation?: AlertCorrelation;
  dashboard: AlertDashboardMetadata;
}

export interface DashboardAlertStreamItem {
  payload: TelegramAlertPayload;
  metadata: AlertDashboardMetadata;
}

export interface DashboardPnlSummaryCard {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  feesUsd: number;
  fundingUsd: number;
  exposureUsd: number;
}

export interface DashboardPortfolioSummary {
  lastSeq: number;
  positions: PortfolioSnapshot["positions"];
  balances: PortfolioSnapshot["balances"];
  pnl: DashboardPnlSummaryCard;
}

export interface DashboardRuntimeGraph {
  nodes: Array<{ id: RuntimeAlertState | string; label: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

export interface DashboardReplayStatus {
  status: string;
  lastSeq: number;
  replayLag?: number;
}

export interface DashboardRecoveryStatus {
  mode: RecoveryReport["mode"];
  status: RecoveryReport["status"];
  checkpointSeq: number;
  reason?: string;
}

export interface DashboardConsensusStatus {
  status: ConsensusCheckResult["status"];
  recommendation: ConsensusCheckResult["recommendation"];
  issues: ConsensusCheckResult["divergence"]["issues"];
}

export function timelineEntryToDashboard(entry: RuntimeTimelineEntry): DashboardTimelineEntry {
  return {
    id: entry.timelineSeq,
    timestamp: entry.timestamp,
    severity: entry.severity,
    type: entry.type,
    tags: entry.tags,
    summaryKey: entry.summaryKey,
    ...(entry.correlation === undefined ? {} : { correlation: entry.correlation }),
    dashboard: entry.dashboard
  };
}

