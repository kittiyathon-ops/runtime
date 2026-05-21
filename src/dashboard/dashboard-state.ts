import type { DashboardAlertStreamItem, DashboardPortfolioSummary, DashboardRuntimeGraph, DashboardTimelineEntry } from "./dashboard-models.js";

export interface DashboardState {
  timeline: DashboardTimelineEntry[];
  alerts: DashboardAlertStreamItem[];
  portfolio?: DashboardPortfolioSummary;
  runtimeGraph: DashboardRuntimeGraph;
}

export function createDashboardState(input: DashboardState): DashboardState {
  return structuredClone(input);
}

