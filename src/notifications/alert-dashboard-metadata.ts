import type { AlertSeverity } from "./alert-severity.js";
import type { AlertMode } from "./alert-mode.js";

// UI-agnostic dashboard metadata derived from alert severity and mode.
// This is a pure derivation layer — no runtime state, no side effects.
// Consumers (routing policy, timeline, dashboard models) use this to
// determine how to render an alert without owning that logic themselves.

export type SeverityColor = "blue" | "yellow" | "orange" | "red";

export interface AlertDashboardMetadata {
  readonly severityColor: SeverityColor;
  readonly icon: string;
  readonly priority: number;
  readonly displayMode: AlertMode;
  readonly pinSuggested: boolean;
  readonly highlightSuggested: boolean;
  readonly escalationSuggested: boolean;
}

/**
 * Derive UI-agnostic dashboard metadata from severity and optional display mode.
 *
 * Deterministic: same inputs always produce the same output.
 * Replay-safe: pure function, no clock reads, no external dependencies.
 */
export function dashboardMetadataForSeverity(
  severity: AlertSeverity,
  mode?: AlertMode
): AlertDashboardMetadata {
  const displayMode: AlertMode = mode ?? "verbose";

  switch (severity) {
    case "INFO":
      return {
        severityColor: "blue",
        icon: "ℹ️",
        priority: 0,
        displayMode: "compact",
        pinSuggested: false,
        highlightSuggested: false,
        escalationSuggested: false
      };

    case "WARNING":
      return {
        severityColor: "yellow",
        icon: "⚠️",
        priority: 1,
        displayMode,
        pinSuggested: false,
        highlightSuggested: false,
        escalationSuggested: false
      };

    case "CRITICAL":
      return {
        severityColor: "orange",
        icon: "🚨",
        priority: 2,
        displayMode: "verbose",
        pinSuggested: true,
        highlightSuggested: true,
        escalationSuggested: false
      };

    case "FATAL":
      return {
        severityColor: "red",
        icon: "💀",
        priority: 3,
        displayMode: "verbose",
        pinSuggested: true,
        highlightSuggested: true,
        escalationSuggested: true
      };

    default: {
      // Exhaustive check — TypeScript will error if a new severity is added
      // without handling it here. Fail closed: treat unknown as FATAL.
      const _unreachable: never = severity;
      void _unreachable;
      return {
        severityColor: "red",
        icon: "💀",
        priority: 3,
        displayMode: "verbose",
        pinSuggested: true,
        highlightSuggested: true,
        escalationSuggested: true
      };
    }
  }
}