import type { ExecutionKernelDecision } from "./execution-kernel.js";
import type { GovernanceState } from "./governance-state-machine.js";
import type { PortfolioSnapshot } from "./portfolio-state-engine.js";
import type { ReplayStatus } from "./replay-engine.js";

export type DivergenceRecommendation = "OK" | "SAFE_MODE" | "HALT";

export interface DivergenceIssue {
  area: "portfolio" | "governance" | "execution" | "replay";
  severity: "WARNING" | "CRITICAL";
  reason: string;
  expected?: unknown;
  actual?: unknown;
}

export interface DivergenceReport {
  divergent: boolean;
  recommendation: DivergenceRecommendation;
  issues: DivergenceIssue[];
}

export class DivergenceDetector {
  compare(input: {
    primaryPortfolio?: PortfolioSnapshot;
    shadowPortfolio?: PortfolioSnapshot;
    primaryGovernance?: GovernanceState;
    shadowGovernance?: GovernanceState;
    primaryExecution?: ExecutionKernelDecision;
    shadowExecution?: ExecutionKernelDecision;
    primaryReplayStatus?: ReplayStatus;
    shadowReplayStatus?: ReplayStatus;
  }): DivergenceReport {
    const issues: DivergenceIssue[] = [];
    if (input.primaryPortfolio !== undefined && input.shadowPortfolio !== undefined) {
      if (stable(input.primaryPortfolio) !== stable(input.shadowPortfolio)) {
        issues.push({ area: "portfolio", severity: "CRITICAL", reason: "portfolio_state_divergence" });
      }
    }
    if (input.primaryGovernance !== undefined && input.shadowGovernance !== undefined && input.primaryGovernance !== input.shadowGovernance) {
      issues.push({ area: "governance", severity: "CRITICAL", reason: "governance_state_divergence", expected: input.primaryGovernance, actual: input.shadowGovernance });
    }
    if (input.primaryExecution !== undefined && input.shadowExecution !== undefined) {
      if (stable(input.primaryExecution) !== stable(input.shadowExecution)) {
        issues.push({ area: "execution", severity: "WARNING", reason: "execution_validation_divergence" });
      }
    }
    if (input.primaryReplayStatus !== undefined && input.shadowReplayStatus !== undefined && input.primaryReplayStatus !== input.shadowReplayStatus) {
      issues.push({ area: "replay", severity: "CRITICAL", reason: "replay_state_divergence", expected: input.primaryReplayStatus, actual: input.shadowReplayStatus });
    }
    return {
      divergent: issues.length > 0,
      recommendation: issues.some((issue) => issue.severity === "CRITICAL") ? "HALT" : issues.length > 0 ? "SAFE_MODE" : "OK",
      issues
    };
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}
