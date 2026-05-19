export type RuntimeMode =
  | "NORMAL"
  | "SAFE_MODE"
  | "REPLAY"
  | "PAPER"
  | "STOPPING"
  | "HALTED";

const VALID_TRANSITIONS: Record<RuntimeMode, readonly RuntimeMode[]> = {
  NORMAL: ["PAPER", "REPLAY", "SAFE_MODE", "STOPPING", "HALTED"],
  PAPER: ["NORMAL", "SAFE_MODE", "STOPPING", "HALTED"],
  REPLAY: ["NORMAL", "SAFE_MODE", "STOPPING", "HALTED"],
  SAFE_MODE: ["STOPPING", "HALTED"],
  STOPPING: ["HALTED"],
  HALTED: []
};

export class RuntimeStateMachine {
  private currentMode: RuntimeMode;

  constructor(initialMode: RuntimeMode = "NORMAL") {
    this.currentMode = initialMode;
  }

  mode(): RuntimeMode {
    return this.currentMode;
  }

  transition(nextMode: RuntimeMode): void {
    if (nextMode === this.currentMode) return;
    if (!VALID_TRANSITIONS[this.currentMode].includes(nextMode)) {
      const previousMode = this.currentMode;
      this.currentMode = "HALTED";
      throw new Error(`invalid_runtime_transition:${previousMode}->${nextMode}`);
    }
    this.currentMode = nextMode;
  }

  canSubmitOrders(): boolean {
    return this.currentMode === "NORMAL" || this.currentMode === "PAPER";
  }
}
