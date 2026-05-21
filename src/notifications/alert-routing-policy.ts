import { normalizeAlertMode, type AlertMode } from "./alert-mode.js";
import { dashboardMetadataForSeverity, type AlertDashboardMetadata } from "./alert-dashboard-metadata.js";
import type { StructuredAlertPayload } from "./alert-types.js";

export interface AlertRouteDecision {
  telegram: boolean;
  persistentJournal: boolean;
  dashboard: boolean;
  mode: AlertMode;
  pin: boolean;
  highlight: boolean;
  repeat: boolean;
  escalate: boolean;
  haltEscalation: boolean;
  dashboardMetadata: AlertDashboardMetadata;
}

export interface AlertRoutingPolicy {
  route(payload: StructuredAlertPayload): AlertRouteDecision;
}

export class DefaultAlertRoutingPolicy implements AlertRoutingPolicy {
  route(payload: StructuredAlertPayload): AlertRouteDecision {
    const requestedMode = normalizeAlertMode(payload.mode);
    if (payload.severity === "INFO") {
      return this.decision(payload, {
        telegram: false,
        persistentJournal: false,
        dashboard: true,
        mode: "compact",
        pin: false,
        highlight: false,
        repeat: false,
        escalate: false,
        haltEscalation: false
      });
    }
    if (payload.severity === "WARNING") {
      return this.decision(payload, {
        telegram: true,
        persistentJournal: false,
        dashboard: true,
        mode: requestedMode === "compact" ? "compact" : "verbose",
        pin: false,
        highlight: false,
        repeat: false,
        escalate: false,
        haltEscalation: false
      });
    }
    if (payload.severity === "CRITICAL") {
      return this.decision(payload, {
        telegram: true,
        persistentJournal: true,
        dashboard: true,
        mode: "verbose",
        pin: true,
        highlight: true,
        repeat: false,
        escalate: false,
        haltEscalation: false
      });
    }
    if (payload.severity === "FATAL") {
      return this.decision(payload, {
        telegram: true,
        persistentJournal: true,
        dashboard: true,
        mode: "verbose",
        pin: true,
        highlight: true,
        repeat: true,
        escalate: true,
        haltEscalation: true
      });
    }
    throw new Error("alert_severity_unknown");
  }

  private decision(
    payload: StructuredAlertPayload,
    decision: Omit<AlertRouteDecision, "dashboardMetadata">
  ): AlertRouteDecision {
    return {
      ...decision,
      dashboardMetadata: dashboardMetadataForSeverity(payload.severity, decision.mode)
    };
  }
}

