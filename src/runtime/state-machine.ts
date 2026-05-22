export type RuntimeMode =
  | "NORMAL"
  | "SAFE_MODE"
  | "HIBERNATION_MODE"
  | "GOVERNANCE_HALT"
  | "ECONOMICALLY_UNVIABLE"
  | "REPLAY"
  | "PAPER"
  | "STOPPING"
  | "HALTED";

const VALID_TRANSITIONS: Record<RuntimeMode, readonly RuntimeMode[]> = {
  NORMAL: ["PAPER", "REPLAY", "SAFE_MODE", "HIBERNATION_MODE", "GOVERNANCE_HALT", "ECONOMICALLY_UNVIABLE", "STOPPING", "HALTED"],
  PAPER: ["NORMAL", "SAFE_MODE", "HIBERNATION_MODE", "GOVERNANCE_HALT", "ECONOMICALLY_UNVIABLE", "STOPPING", "HALTED"],
  REPLAY: ["NORMAL", "SAFE_MODE", "HIBERNATION_MODE", "GOVERNANCE_HALT", "ECONOMICALLY_UNVIABLE", "STOPPING", "HALTED"],
  SAFE_MODE: ["HIBERNATION_MODE", "GOVERNANCE_HALT", "ECONOMICALLY_UNVIABLE", "STOPPING", "HALTED"],
  HIBERNATION_MODE: ["SAFE_MODE", "GOVERNANCE_HALT", "ECONOMICALLY_UNVIABLE", "STOPPING", "HALTED"],
  GOVERNANCE_HALT: ["STOPPING", "HALTED"],
  ECONOMICALLY_UNVIABLE: ["STOPPING", "HALTED"],
  STOPPING: ["HALTED"],
  HALTED: []
};

export type TransitionAuthorization = "auto" | "operator" | "dual_confirmation";

export interface RuntimeTransitionRule {
  readonly from: RuntimeMode;
  readonly to: RuntimeMode;
  readonly authorization: TransitionAuthorization;
  readonly invariantsBefore: readonly string[];
  readonly invariantsAfter: readonly string[];
  readonly requiredEvidence: readonly string[];
}

export const RUNTIME_TRANSITION_RULES: readonly RuntimeTransitionRule[] = Object.entries(VALID_TRANSITIONS).flatMap(
  ([from, targets]) => targets.map((to) => transitionRule(from as RuntimeMode, to))
);

export class RuntimeStateMachine {
  private currentMode: RuntimeMode;

  constructor(initialMode: RuntimeMode = "NORMAL") {
    this.currentMode = initialMode;
  }

  mode(): RuntimeMode {
    return this.currentMode;
  }

  transition(nextMode: RuntimeMode, evidenceIds?: readonly string[]): void {
    if (nextMode === this.currentMode) return;
    if (!VALID_TRANSITIONS[this.currentMode].includes(nextMode)) {
      const previousMode = this.currentMode;
      this.currentMode = "HALTED";
      throw new Error(`invalid_runtime_transition:${previousMode}->${nextMode}`);
    }
    const rule = transitionRule(this.currentMode, nextMode);
    const capturedEvidenceIds = evidenceIds ?? rule.requiredEvidence;
    for (const evidence of rule.requiredEvidence) {
      if (!capturedEvidenceIds.includes(evidence)) {
        throw new Error(`runtime_transition_evidence_required:${this.currentMode}->${nextMode}:${evidence}`);
      }
    }
    this.currentMode = nextMode;
  }

  canSubmitOrders(): boolean {
    return this.currentMode === "NORMAL" || this.currentMode === "PAPER";
  }
}

export function transitionRule(from: RuntimeMode, to: RuntimeMode): RuntimeTransitionRule {
  const terminal = to === "HALTED" || to === "GOVERNANCE_HALT";
  const economic = to === "ECONOMICALLY_UNVIABLE";
  return {
    from,
    to,
    authorization: terminal ? "dual_confirmation" : economic ? "auto" : to === "NORMAL" ? "operator" : "auto",
    invariantsBefore: ["append_only_evidence_available", "transition_declared"],
    invariantsAfter: to === "NORMAL" || to === "PAPER" ? ["order_submission_gate_explicit"] : ["order_submission_disabled_or_guarded"],
    requiredEvidence: economic ? ["negative_net_edge"] : terminal ? ["halt_reason"] : ["runtime_transition"]
  };
}
