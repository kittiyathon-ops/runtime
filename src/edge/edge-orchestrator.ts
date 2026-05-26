import type { AuditSink } from "../audit/audit-log.js";
import type { GovernanceStateMachine, GovernanceTrigger } from "../runtime/governance-state-machine.js";
import type { EdgeDegradationRecommendation } from "./edge-degradation.js";
import type { EdgeRecommendation, EdgeSeverity } from "./edge-types.js";

export interface EdgeGovernanceOrchestratorDeps {
  governance: GovernanceStateMachine;
  audit: AuditSink;
}

export interface EdgeGovernanceDecision {
  readonly applied: boolean;
  readonly recommendation: EdgeRecommendation;
  readonly trigger?: GovernanceTrigger;
  readonly targetState?: ReturnType<GovernanceStateMachine["state"]>;
  readonly reason: string;
}

export class EdgeGovernanceOrchestrator {
  private readonly governance: GovernanceStateMachine;
  private readonly audit: AuditSink;

  constructor(deps: EdgeGovernanceOrchestratorDeps) {
    this.governance = deps.governance;
    this.audit = deps.audit;
  }

  apply(rec: EdgeDegradationRecommendation, sourceId?: string): EdgeGovernanceDecision {
    this.audit.record({
      action: "edge_recommendation_received",
      metrics: this.metrics(rec, sourceId)
    });

    const trigger = this.mapRecommendationToTrigger(rec.recommendation, rec.severity);
    if (trigger === undefined) {
      const decision = {
        applied: false,
        recommendation: rec.recommendation,
        reason: "edge_recommendation_no_governance_action"
      } satisfies EdgeGovernanceDecision;
      this.audit.record({
        action: "edge_recommendation_ignored",
        reason: decision.reason,
        metrics: this.metrics(rec, sourceId)
      });
      return decision;
    }

    const reason = `edge_recommendation:${rec.recommendation}:${rec.reasons.join("|")}`;
    try {
      const targetState = this.governance.recommend(trigger);
      this.audit.record({
        action: "edge_recommendation_mapping",
        metrics: {
          ...this.metrics(rec, sourceId),
          trigger,
          targetState
        }
      });
      this.governance.transition(targetState, trigger, reason);
      const decision = {
        applied: true,
        recommendation: rec.recommendation,
        trigger,
        targetState,
        reason
      } satisfies EdgeGovernanceDecision;
      this.audit.record({
        action: "edge_recommendation_applied",
        reason,
        metrics: {
          ...this.metrics(rec, sourceId),
          trigger,
          targetState
        }
      });
      return decision;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "edge_governance_transition_failed";
      const decision = {
        applied: false,
        recommendation: rec.recommendation,
        trigger,
        reason: failureReason
      } satisfies EdgeGovernanceDecision;
      this.audit.record({
        action: "edge_recommendation_failed_closed",
        reason: failureReason,
        metrics: {
          ...this.metrics(rec, sourceId),
          trigger
        }
      });
      return decision;
    }
  }

  private mapRecommendationToTrigger(recommendation: EdgeRecommendation, severity: EdgeSeverity): GovernanceTrigger | undefined {
    if (recommendation === "ACCEPT") return undefined;
    if (recommendation === "THROTTLE") return "reject_rate_spike";
    if (recommendation === "PASSIVE_ONLY") return "reject_rate_spike";
    if (recommendation === "SAFE_MODE") return "stale_feed";
    if (recommendation === "QUARANTINE_SOURCE") return severity === "FATAL" ? "sequence_integrity_breach" : "exchange_confidence_low";
    if (recommendation === "HALT_INPUT") return "sequence_integrity_breach";
    return undefined;
  }

  private metrics(rec: EdgeDegradationRecommendation, sourceId: string | undefined): Record<string, unknown> {
    return {
      recommendation: rec.recommendation,
      severity: rec.severity,
      reasons: [...rec.reasons],
      ...(sourceId === undefined ? {} : { sourceId })
    };
  }
}
