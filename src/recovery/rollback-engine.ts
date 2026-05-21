import type { SafeStateTransition } from "./safe-state-transitions.js";

export interface RollbackPoint {
  checkpointSeq: number;
  timestamp: number;
  traceId: string;
  reason: string;
}

export interface RollbackPlan {
  status: "ROLLBACK_READY" | "FAILED_CLOSED";
  targetCheckpointSeq: number;
  reason: string;
  preserveTimelineContinuity: boolean;
  requiredTransition?: SafeStateTransition;
}

export class RollbackEngine {
  plan(points: readonly RollbackPoint[], currentSeq: number, reason: string, transition?: SafeStateTransition): RollbackPlan {
    if (currentSeq < 0) throw new Error("current_seq_invalid");
    const candidates = points
      .filter((point) => point.checkpointSeq <= currentSeq)
      .sort((left, right) => right.checkpointSeq - left.checkpointSeq || right.timestamp - left.timestamp);
    const target = candidates[0];
    if (target === undefined) {
      return {
        status: "FAILED_CLOSED",
        targetCheckpointSeq: 0,
        reason: "rollback_point_unavailable",
        preserveTimelineContinuity: true,
        ...(transition === undefined ? {} : { requiredTransition: transition })
      };
    }
    return {
      status: "ROLLBACK_READY",
      targetCheckpointSeq: target.checkpointSeq,
      reason,
      preserveTimelineContinuity: true,
      ...(transition === undefined ? {} : { requiredTransition: transition })
    };
  }
}
