export type GovernanceState = "NORMAL" | "DEGRADED" | "SAFE_MODE" | "HIBERNATION_MODE" | "GOVERNANCE_HALT" | "HALTED" | "REPLAY" | "SHADOW";
export type GovernanceTrigger =
  | "manual"
  | "stale_feed"
  | "replay_mismatch"
  | "persistence_instability"
  | "reject_rate_spike"
  | "adapter_disconnect_storm"
  | "rest_api_degradation"
  | "heartbeat_missed"
  | "exchange_confidence_low"
  | "sequence_integrity_breach"
  | "ghost_order"
  | "orphan_fill"
  | "exposure_integrity_breach"
  | "replay_mode_activation"
  | "shadow_runtime_activation";

export interface GovernanceTransition {
  from: GovernanceState;
  to: GovernanceState;
  trigger: GovernanceTrigger;
  reason: string;
}

const TRANSITIONS: Record<GovernanceState, readonly GovernanceState[]> = {
  NORMAL: ["DEGRADED", "SAFE_MODE", "HIBERNATION_MODE", "GOVERNANCE_HALT", "HALTED", "REPLAY", "SHADOW"],
  DEGRADED: ["NORMAL", "SAFE_MODE", "HIBERNATION_MODE", "GOVERNANCE_HALT", "HALTED", "REPLAY"],
  SAFE_MODE: ["HIBERNATION_MODE", "GOVERNANCE_HALT", "HALTED", "REPLAY"],
  HIBERNATION_MODE: ["SAFE_MODE", "GOVERNANCE_HALT", "HALTED"],
  GOVERNANCE_HALT: ["HALTED"],
  REPLAY: ["NORMAL", "GOVERNANCE_HALT", "HALTED"],
  SHADOW: ["NORMAL", "GOVERNANCE_HALT", "HALTED"],
  HALTED: []
};

export class GovernanceStateMachine {
  private current: GovernanceState;
  private readonly history: GovernanceTransition[] = [];

  constructor(initial: GovernanceState = "NORMAL") {
    this.current = initial;
  }

  state(): GovernanceState {
    return this.current;
  }

  transitions(): readonly GovernanceTransition[] {
    return this.history;
  }

  transition(to: GovernanceState, trigger: GovernanceTrigger, reason: string): GovernanceTransition {
    if (to === this.current) {
      const transition = { from: this.current, to, trigger, reason };
      this.history.push(transition);
      return transition;
    }
    if (!TRANSITIONS[this.current].includes(to)) {
      throw new Error(`invalid_governance_transition:${this.current}->${to}`);
    }
    const transition = { from: this.current, to, trigger, reason };
    this.current = to;
    this.history.push(transition);
    return transition;
  }

  recommend(trigger: GovernanceTrigger): GovernanceState {
    if (trigger === "stale_feed" || trigger === "adapter_disconnect_storm") return "SAFE_MODE";
    if (trigger === "rest_api_degradation") return "HIBERNATION_MODE";
    if (trigger === "replay_mismatch" || trigger === "persistence_instability") return "GOVERNANCE_HALT";
    if (trigger === "heartbeat_missed" || trigger === "exchange_confidence_low") return "GOVERNANCE_HALT";
    if (trigger === "sequence_integrity_breach" || trigger === "ghost_order" || trigger === "orphan_fill" || trigger === "exposure_integrity_breach") return "GOVERNANCE_HALT";
    if (trigger === "reject_rate_spike") return "DEGRADED";
    if (trigger === "replay_mode_activation") return "REPLAY";
    if (trigger === "shadow_runtime_activation") return "SHADOW";
    return this.current;
  }
}
