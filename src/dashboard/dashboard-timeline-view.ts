import { timelineEntryToDashboard, type DashboardTimelineEntry } from "./dashboard-models.js";
import type { RuntimeTimelineEntry } from "../runtime/runtime-timeline.js";

export function buildTimelineView(entries: readonly RuntimeTimelineEntry[]): DashboardTimelineEntry[] {
  return entries.map((entry) => timelineEntryToDashboard(entry));
}

