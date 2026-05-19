import type { PortfolioSnapshot } from "../portfolio/portfolio-state.js";
import type { RiskState } from "../risk/risk-engine.js";
import type { RuntimeMode } from "./state-machine.js";

export interface RuntimeCheckpoint {
  seq: number;
  timestamp: number;
  mode: RuntimeMode;
  portfolio: PortfolioSnapshot;
  risk: RiskState;
}

export class CheckpointStore {
  private latestValue?: RuntimeCheckpoint;

  save(checkpoint: RuntimeCheckpoint): void {
    this.latestValue = structuredClone(checkpoint);
  }

  latest(): RuntimeCheckpoint | undefined {
    return this.latestValue ? structuredClone(this.latestValue) : undefined;
  }
}
