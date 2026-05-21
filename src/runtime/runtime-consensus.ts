import { DivergenceDetector, type DivergenceReport } from "./divergence-detector.js";
import type { ShadowRuntimeComparison, ShadowRuntimeState } from "./shadow-runtime.js";

export interface ConsensusCheckResult {
  status: "MATCH" | "DIVERGENT";
  recommendation: DivergenceReport["recommendation"];
  divergence: DivergenceReport;
  comparison: ShadowRuntimeComparison;
}

export class RuntimeConsensus {
  constructor(private readonly detector = new DivergenceDetector()) {}

  check(primary: ShadowRuntimeState, shadow: ShadowRuntimeState): ConsensusCheckResult {
    const divergence = this.detector.compare({
      ...(primary.portfolio === undefined ? {} : { primaryPortfolio: primary.portfolio }),
      ...(shadow.portfolio === undefined ? {} : { shadowPortfolio: shadow.portfolio }),
      ...(primary.governance === undefined ? {} : { primaryGovernance: primary.governance }),
      ...(shadow.governance === undefined ? {} : { shadowGovernance: shadow.governance }),
      ...(primary.execution === undefined ? {} : { primaryExecution: primary.execution }),
      ...(shadow.execution === undefined ? {} : { shadowExecution: shadow.execution }),
      ...(primary.replayStatus === undefined ? {} : { primaryReplayStatus: primary.replayStatus }),
      ...(shadow.replayStatus === undefined ? {} : { shadowReplayStatus: shadow.replayStatus })
    });
    return {
      status: divergence.divergent ? "DIVERGENT" : "MATCH",
      recommendation: divergence.recommendation,
      divergence,
      comparison: { primary, shadow }
    };
  }
}
