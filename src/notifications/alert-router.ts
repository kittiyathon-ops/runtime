import type { StructuredAlertPayload } from "./alert-types.js";
import { DefaultAlertRoutingPolicy, type AlertRouteDecision, type AlertRoutingPolicy } from "./alert-routing-policy.js";

export interface AlertRouteResult {
  payload: StructuredAlertPayload;
  decision: AlertRouteDecision;
}

export class AlertRouter {
  constructor(private readonly policy: AlertRoutingPolicy = new DefaultAlertRoutingPolicy()) {}

  route(payload: StructuredAlertPayload): AlertRouteResult {
    return {
      payload,
      decision: this.policy.route(payload)
    };
  }
}

