import type { AlertMode } from "./alert-mode.js";
import type { AlertSeverity } from "./alert-severity.js";
import { severityEmoji } from "./emoji-map.js";

export type SeverityColor = "blue" | "yellow" | "orange" | "red";

export interface AlertDashboardMetadata {
  severityColor: SeverityColor;
  icon: string;
  priority: number;
  displayMode: AlertMode;
  pinSuggested: boolean;
  highlightSuggested: boolean;
  escalationSuggested: boolean;
}

export function dashboardMetadataForSeverity(
  severity: AlertSeverity,
  displayMode: AlertMode = "verbose"
): AlertDashboardMetadata {
  if (severity === "INFO") {
    return {
      severityColor: "blue",
      icon: severityEmoji(severity),
      priority: 1,
      displayMode,
      pinSuggested: false,
      highlightSuggested: false,
      escalationSuggested: false
    };
  }
  if (severity === "WARNING") {
    return {
      severityColor: "yellow",
      icon: severityEmoji(severity),
      priority: 2,
      displayMode,
      pinSuggested: false,
      highlightSuggested: false,
      escalationSuggested: false
    };
  }
  if (severity === "CRITICAL") {
    return {
      severityColor: "orange",
      icon: severityEmoji(severity),
      priority: 3,
      displayMode,
      pinSuggested: true,
      highlightSuggested: true,
      escalationSuggested: false
    };
  }
  return {
    severityColor: "red",
    icon: severityEmoji(severity),
    priority: 4,
    displayMode,
    pinSuggested: true,
    highlightSuggested: true,
    escalationSuggested: true
  };
}

