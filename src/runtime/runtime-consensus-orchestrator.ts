import type { AuditSink } from "../audit/audit-log.js";
import type { GovernanceStateMachine, GovernanceTrigger } from "./governance-state-machine.js";
import type { ConsensusCheckResult } from "./runtime-consensus.js";

export interface RuntimeConsensusGovernanceDecision {
  readonly applied: boolean;
  readonly recommendation: ConsensusCheckResult["recommendation"];
  readonly trigger?: GovernanceTrigger;
  readonly targetState?: ReturnType<GovernanceStateMachine["state"]>;
  readonly reason: string;
}

export class RuntimeConsensusGovernanceOrchestrator {
  constructor(
    private readonly governance: GovernanceStateMachine,
    private readonly audit: AuditSink
  ) {}

  apply(result: ConsensusCheckResult): RuntimeConsensusGovernanceDecision {
    this.audit.record({
      action: "runtime_consensus_recommendation_received",
      metrics: this.metrics(result)
    });

    const trigger = this.mapRecommendationToTrigger(result.recommendation);
    if (trigger === undefined) {
      const decision = {
        applied: false,
        recommendation: result.recommendation,
        reason: "runtime_consensus_no_governance_action"
      } satisfies RuntimeConsensusGovernanceDecision;
      this.audit.record({
        action: "runtime_consensus_recommendation_ignored",
        reason: decision.reason,
        metrics: this.metrics(result)
      });
      return decision;
    }

    const reason = `runtime_consensus:${result.recommendation}:${result.divergence.issues.map((issue) => issue.reason).join("|")}`;
    try {
      const targetState = this.governance.recommend(trigger);
      this.audit.record({
        action: "runtime_consensus_recommendation_mapping",
        metrics: {
          ...this.metrics(result),
          trigger,
          targetState
        }
      });
      this.governance.transition(targetState, trigger, reason);
      const decision = {
        applied: true,
        recommendation: result.recommendation,
        trigger,
        targetState,
        reason
      } satisfies RuntimeConsensusGovernanceDecision;
      this.audit.record({
        action: "runtime_consensus_recommendation_applied",
        reason,
        metrics: {
          ...this.metrics(result),
          trigger,
          targetState
        }
      });
      return decision;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "runtime_consensus_governance_transition_failed";
      const decision = {
        applied: false,
        recommendation: result.recommendation,
        trigger,
        reason: failureReason
      } satisfies RuntimeConsensusGovernanceDecision;
      this.audit.record({
        action: "runtime_consensus_recommendation_failed_closed",
        reason: failureReason,
        metrics: {
          ...this.metrics(result),
          trigger
        }
      });
      return decision;
    }
  }

  private mapRecommendationToTrigger(recommendation: ConsensusCheckResult["recommendation"]): GovernanceTrigger | undefined {
    if (recommendation === "OK") return undefined;
    if (recommendation === "SAFE_MODE") return "stale_feed";
    if (recommendation === "HALT") return "replay_mismatch";
    return undefined;
  }

  private metrics(result: ConsensusCheckResult): Record<string, unknown> {
    return {
      status: result.status,
      recommendation: result.recommendation,
      issues: result.divergence.issues.map((issue) => ({
        area: issue.area,
        severity: issue.severity,
        reason: issue.reason
      }))
    };
  }
}
