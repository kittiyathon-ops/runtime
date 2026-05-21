import type { DashboardRuntimeGraph } from "./dashboard-models.js";

export function buildRuntimeStateGraph(): DashboardRuntimeGraph {
  return {
    nodes: ["NORMAL", "DEGRADED", "SAFE_MODE", "HALTED", "REPLAY", "SHADOW"].map((state) => ({ id: state, label: state })),
    edges: [
      { from: "NORMAL", to: "DEGRADED" },
      { from: "NORMAL", to: "SAFE_MODE" },
      { from: "DEGRADED", to: "SAFE_MODE" },
      { from: "SAFE_MODE", to: "HALTED" },
      { from: "NORMAL", to: "REPLAY" },
      { from: "NORMAL", to: "SHADOW" }
    ]
  };
}

