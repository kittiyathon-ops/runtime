import type { ExecutionKernelDecision } from "./execution-kernel.js";
import type { GovernanceState } from "./governance-state-machine.js";
import type { PortfolioSnapshot } from "./portfolio-state-engine.js";
import type { ReplayStatus } from "./replay-engine.js";

export interface ShadowRuntimeState {
  portfolio?: PortfolioSnapshot;
  governance?: GovernanceState;
  execution?: ExecutionKernelDecision;
  replayStatus?: ReplayStatus;
}

export interface ShadowRuntimeComparison {
  primary: ShadowRuntimeState;
  shadow: ShadowRuntimeState;
}

export class ShadowRuntime {
  constructor(private readonly state: ShadowRuntimeState) {}

  snapshot(): ShadowRuntimeState {
    return structuredClone(this.state);
  }
}

