import type { DashboardRuntimeGraph } from "./dashboard-models.js";
import type { EdgeAttributionReport } from "../economy/edge-attribution.js";
import type { DashboardEdgeAttributionSection } from "./dashboard-models.js";

export function buildRuntimeStateGraph(): DashboardRuntimeGraph {
  return {
    nodes: ["NORMAL", "DEGRADED", "SAFE_MODE", "ECONOMICALLY_UNVIABLE", "HALTED", "REPLAY", "SHADOW"].map((state) => ({ id: state, label: state })),
    edges: [
      { from: "NORMAL", to: "DEGRADED" },
      { from: "NORMAL", to: "SAFE_MODE" },
      { from: "DEGRADED", to: "SAFE_MODE" },
      { from: "SAFE_MODE", to: "ECONOMICALLY_UNVIABLE", label: "negative_net_edge" },
      { from: "SAFE_MODE", to: "HALTED" },
      { from: "NORMAL", to: "REPLAY" },
      { from: "NORMAL", to: "SHADOW" }
    ]
  };
}

export function buildEdgeAttributionSection(report: EdgeAttributionReport): DashboardEdgeAttributionSection {
  const runtimeEdgeBps = report.executionQualityEdgeBps;
  const marketEdgeBps = report.strategyGrossEdgeBps;
  const totalCostBps =
    report.survivabilityOverheadBps +
    report.reconciliationCostBps +
    report.governancePenaltyBps +
    report.operationalOverheadBps +
    report.infrastructureComplexityCostBps;
  return {
    section: "EDGE_ATTRIBUTION",
    prominence: "PRIMARY",
    report,
    runtimeEdgeBps,
    marketEdgeBps,
    totalCostBps,
    viable: report.netRealizedEdgeBps >= 0.05
  };
}
