import { EmergencyStop, type EmergencyStopRecord } from "../recovery/emergency-stop.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type SurvivabilityAction = "CONTINUE" | "DEGRADE" | "SAFE_MODE" | "HIBERNATION_MODE" | "GOVERNANCE_HALT";

export interface ExchangeConfidenceInput {
  readonly exchangeReachable: boolean;
  readonly userStreamFresh: boolean;
  readonly marketStreamFresh: boolean;
  readonly localExchangeDivergence: boolean;
  readonly reconnectStorm: boolean;
  readonly sequenceGap: boolean;
  readonly evidenceIds: readonly string[];
}

export interface ReplayIntegrityInput {
  readonly replayConsistent: boolean;
  readonly mutableHistoryDetected: boolean;
  readonly missingSequence: boolean;
  readonly duplicateSequence: boolean;
  readonly outOfOrderSequence: boolean;
  readonly evidenceIds: readonly string[];
}

export interface ExposureInput {
  readonly currentExposure: string;
  readonly pendingOrderNotional: string;
  readonly maxExposure: string;
  readonly partialFillNotional?: string;
  readonly evidenceIds: readonly string[];
}

export interface SurvivabilityDecision {
  readonly action: SurvivabilityAction;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly emergencyStop?: EmergencyStopRecord;
}

export interface StaleFeedGovernanceInput {
  readonly staleDurationMs: number;
  readonly staleThresholdMs: number;
  readonly websocketHealthy: boolean;
  readonly executionAckDriftMs: number;
  readonly maxExecutionAckDriftMs: number;
  readonly sequenceIntegrityOk: boolean;
  readonly reconciliationConfidence: "HIGH" | "MEDIUM" | "LOW";
  readonly evidenceIds: readonly string[];
}

export class SurvivabilityProvider {
  private readonly emergencyStop = new EmergencyStop();

  evaluate(input: {
    readonly exchange: ExchangeConfidenceInput;
    readonly replay: ReplayIntegrityInput;
    readonly exposure: ExposureInput;
    readonly nowMs: number;
    readonly traceId: string;
  }): SurvivabilityDecision {
    if (!Number.isInteger(input.nowMs) || input.nowMs < 0) throw new Error("survivability_time_invalid");
    if (input.traceId.length === 0) throw new Error("survivability_trace_required");
    const evidenceIds = [...input.exchange.evidenceIds, ...input.replay.evidenceIds, ...input.exposure.evidenceIds];
    if (evidenceIds.length === 0) throw new Error("survivability_requires_evidence");

    const reasons = [
      ...this.exchangeReasons(input.exchange),
      ...this.replayReasons(input.replay),
      ...this.exposureReasons(input.exposure)
    ];
    const score = Math.max(0, 100 - reasons.length * 15 - this.criticalCount(reasons) * 35);
    const action = this.actionForReasons(reasons, score);
    const emergencyStop = action === "GOVERNANCE_HALT"
      ? this.emergencyStop.trigger(input.nowMs, input.traceId, reasons[0] ?? "governance_halt", evidenceIds)
      : undefined;

    return {
      action,
      score,
      reasons,
      evidenceIds,
      ...(emergencyStop === undefined ? {} : { emergencyStop })
    };
  }

  exchangeConfidence(input: ExchangeConfidenceInput): SurvivabilityDecision {
    const evidenceIds = [...input.evidenceIds];
    if (evidenceIds.length === 0) throw new Error("exchange_confidence_requires_evidence");
    const reasons = this.exchangeReasons(input);
    const score = Math.max(0, 100 - reasons.length * 20 - (input.localExchangeDivergence ? 50 : 0));
    return {
      action: this.actionForReasons(reasons, score),
      score,
      reasons,
      evidenceIds
    };
  }

  partialFillAwareExposure(input: ExposureInput): { status: "EXPOSURE_OK" | "EXPOSURE_LIMIT_BREACHED"; projectedExposure: string; evidenceIds: readonly string[] } {
    this.assertExposure(input);
    const projected = PrecisionMath.add(
      PrecisionMath.add(input.currentExposure, input.pendingOrderNotional),
      input.partialFillNotional ?? "0"
    );
    return {
      status: PrecisionMath.compare(projected, input.maxExposure) > 0 ? "EXPOSURE_LIMIT_BREACHED" : "EXPOSURE_OK",
      projectedExposure: projected,
      evidenceIds: [...input.evidenceIds]
    };
  }

  staleFeedGovernance(input: StaleFeedGovernanceInput): SurvivabilityDecision {
    if (input.evidenceIds.length === 0) throw new Error("stale_feed_governance_requires_evidence");
    if (!Number.isFinite(input.staleDurationMs) || input.staleDurationMs < 0) throw new Error("stale_duration_invalid");
    if (!Number.isFinite(input.staleThresholdMs) || input.staleThresholdMs <= 0) throw new Error("stale_threshold_invalid");
    const reasons = [
      ...(input.staleDurationMs > input.staleThresholdMs ? ["feed_stale"] : []),
      ...(!input.websocketHealthy ? ["websocket_unhealthy"] : []),
      ...(input.executionAckDriftMs > input.maxExecutionAckDriftMs ? ["execution_ack_drift"] : []),
      ...(!input.sequenceIntegrityOk ? ["sequence_integrity_breach"] : []),
      ...(input.reconciliationConfidence === "LOW" ? ["reconciliation_confidence_low"] : [])
    ];
    const score = Math.max(0, 100
      - Math.min(35, Math.floor((input.staleDurationMs / input.staleThresholdMs) * 20))
      - (!input.websocketHealthy ? 20 : 0)
      - (input.executionAckDriftMs > input.maxExecutionAckDriftMs ? 20 : 0)
      - (!input.sequenceIntegrityOk ? 35 : 0)
      - (input.reconciliationConfidence === "LOW" ? 30 : input.reconciliationConfidence === "MEDIUM" ? 10 : 0));
    return {
      action: this.actionForStaleFeed(reasons, score),
      score,
      reasons,
      evidenceIds: [...input.evidenceIds]
    };
  }

  currentEmergencyStop(): EmergencyStopRecord {
    return this.emergencyStop.current();
  }

  private exchangeReasons(input: ExchangeConfidenceInput): string[] {
    if (input.evidenceIds.length === 0) throw new Error("exchange_confidence_requires_evidence");
    return [
      ...(!input.exchangeReachable ? ["exchange_unreachable"] : []),
      ...(!input.userStreamFresh ? ["user_stream_stale"] : []),
      ...(!input.marketStreamFresh ? ["market_stream_stale"] : []),
      ...(input.localExchangeDivergence ? ["exchange_local_divergence"] : []),
      ...(input.reconnectStorm ? ["reconnect_storm"] : []),
      ...(input.sequenceGap ? ["sequence_gap"] : [])
    ];
  }

  private replayReasons(input: ReplayIntegrityInput): string[] {
    if (input.evidenceIds.length === 0) throw new Error("replay_integrity_requires_evidence");
    return [
      ...(!input.replayConsistent ? ["replay_inconsistent"] : []),
      ...(input.mutableHistoryDetected ? ["mutable_replay_history"] : []),
      ...(input.missingSequence ? ["missing_sequence"] : []),
      ...(input.duplicateSequence ? ["duplicate_sequence"] : []),
      ...(input.outOfOrderSequence ? ["out_of_order_sequence"] : [])
    ];
  }

  private exposureReasons(input: ExposureInput): string[] {
    const exposure = this.partialFillAwareExposure(input);
    return exposure.status === "EXPOSURE_LIMIT_BREACHED" ? ["exposure_limit_breached"] : [];
  }

  private assertExposure(input: ExposureInput): void {
    if (input.evidenceIds.length === 0) throw new Error("exposure_requires_evidence");
    PrecisionMath.assertDecimal(input.currentExposure, "current_exposure");
    PrecisionMath.assertDecimal(input.pendingOrderNotional, "pending_order_notional");
    PrecisionMath.assertDecimal(input.maxExposure, "max_exposure");
    if (input.partialFillNotional !== undefined) PrecisionMath.assertDecimal(input.partialFillNotional, "partial_fill_notional");
  }

  private actionForReasons(reasons: readonly string[], score: number): SurvivabilityAction {
    if (reasons.some((reason) => reason === "mutable_replay_history" || reason === "replay_inconsistent" || reason === "exchange_local_divergence")) {
      return "GOVERNANCE_HALT";
    }
    if (reasons.some((reason) => reason === "missing_sequence" || reason === "duplicate_sequence" || reason === "out_of_order_sequence" || reason === "exposure_limit_breached")) {
      return "GOVERNANCE_HALT";
    }
    if (score < 50) return "SAFE_MODE";
    if (reasons.length > 0) return "DEGRADE";
    return "CONTINUE";
  }

  private actionForStaleFeed(reasons: readonly string[], score: number): SurvivabilityAction {
    if (reasons.includes("sequence_integrity_breach") && reasons.includes("reconciliation_confidence_low")) return "GOVERNANCE_HALT";
    if (score < 35) return "HIBERNATION_MODE";
    if (score < 60) return "SAFE_MODE";
    if (reasons.length > 0) return "DEGRADE";
    return "CONTINUE";
  }

  private criticalCount(reasons: readonly string[]): number {
    return reasons.filter((reason) => reason === "mutable_replay_history" || reason === "replay_inconsistent" || reason === "exchange_local_divergence" || reason.endsWith("sequence") || reason === "exposure_limit_breached").length;
  }
}
