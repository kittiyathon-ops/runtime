import type { DashboardConsensusStatus, DashboardRecoveryStatus, DashboardReplayStatus } from "./dashboard-models.js";
import type { ConsensusCheckResult } from "../runtime/runtime-consensus.js";
import type { RecoveryReport } from "../runtime/recovery-manager.js";
import type { ReplayCheckpoint } from "../runtime/replay-engine.js";

export function buildReplayStatus(checkpoint: ReplayCheckpoint): DashboardReplayStatus {
  return {
    status: checkpoint.status,
    lastSeq: checkpoint.cursor.lastSeq,
    replayLag: checkpoint.replayLag
  };
}

export function buildRecoveryStatus(report: RecoveryReport): DashboardRecoveryStatus {
  return {
    mode: report.mode,
    status: report.status,
    checkpointSeq: report.checkpointSeq,
    ...(report.reason === undefined ? {} : { reason: report.reason })
  };
}

export function buildConsensusStatus(result: ConsensusCheckResult): DashboardConsensusStatus {
  return {
    status: result.status,
    recommendation: result.recommendation,
    issues: result.divergence.issues
  };
}

