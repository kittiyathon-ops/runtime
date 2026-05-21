export type SafeRuntimeState = "NORMAL" | "DEGRADED" | "SAFE_MODE" | "HALTED" | "MANUAL_REVIEW";
export type RecoveryTrigger =
  | "trust_collapse"
  | "exchange_partition"
  | "governance_crash"
  | "replay_divergence"
  | "operational_reality_disputed"
  | "manual_release";

export interface SafeStateTransition {
  from: SafeRuntimeState;
  to: SafeRuntimeState;
  trigger: RecoveryTrigger;
  reason: string;
  timestamp: number;
  traceId: string;
}

const ALLOWED: Record<SafeRuntimeState, readonly SafeRuntimeState[]> = {
  NORMAL: ["DEGRADED", "SAFE_MODE", "HALTED"],
  DEGRADED: ["NORMAL", "SAFE_MODE", "HALTED", "MANUAL_REVIEW"],
  SAFE_MODE: ["HALTED", "MANUAL_REVIEW"],
  MANUAL_REVIEW: ["DEGRADED", "HALTED"],
  HALTED: []
};

export class SafeStateTransitionProtocol {
  private current: SafeRuntimeState;
  private readonly history: SafeStateTransition[] = [];

  constructor(initial: SafeRuntimeState = "NORMAL") {
    this.current = initial;
  }

  state(): SafeRuntimeState {
    return this.current;
  }

  transition(to: SafeRuntimeState, trigger: RecoveryTrigger, reason: string, timestamp: number, traceId: string): SafeStateTransition {
    if (traceId.length === 0) throw new Error("trace_id_required");
    if (to !== this.current && !ALLOWED[this.current].includes(to)) {
      throw new Error(`invalid_safe_state_transition:${this.current}->${to}`);
    }
    const transition = Object.freeze({ from: this.current, to, trigger, reason, timestamp, traceId });
    this.history.push(transition);
    this.current = to;
    return transition;
  }

  historyView(): readonly SafeStateTransition[] {
    return this.history;
  }
}
