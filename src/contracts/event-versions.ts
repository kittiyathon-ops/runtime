import type { CanonicalEventType } from "./event-types.js";

export interface EventVersion {
  eventType: CanonicalEventType;
  version: number;
  introducedAt: string;
}

export const CURRENT_EVENT_VERSIONS: Record<CanonicalEventType, EventVersion> = {
  MARKET_TICK: { eventType: "MARKET_TICK", version: 1, introducedAt: "runtime-core" },
  BOOK_UPDATE: { eventType: "BOOK_UPDATE", version: 1, introducedAt: "runtime-core" },
  SIGNAL_CREATED: { eventType: "SIGNAL_CREATED", version: 1, introducedAt: "signals" },
  INTENT_CREATED: { eventType: "INTENT_CREATED", version: 1, introducedAt: "execution" },
  ORDER_SUBMITTED: { eventType: "ORDER_SUBMITTED", version: 1, introducedAt: "execution" },
  ORDER_ACCEPTED: { eventType: "ORDER_ACCEPTED", version: 1, introducedAt: "live-execution" },
  ORDER_FILLED: { eventType: "ORDER_FILLED", version: 1, introducedAt: "paper-fill" },
  ORDER_REJECTED: { eventType: "ORDER_REJECTED", version: 1, introducedAt: "execution" },
  EXECUTION_ERROR: { eventType: "EXECUTION_ERROR", version: 1, introducedAt: "live-execution" },
  POSITION_UPDATED: { eventType: "POSITION_UPDATED", version: 1, introducedAt: "portfolio" },
  FEE_CHARGED: { eventType: "FEE_CHARGED", version: 1, introducedAt: "portfolio-accounting" },
  FUNDING_FEE_APPLIED: { eventType: "FUNDING_FEE_APPLIED", version: 1, introducedAt: "portfolio-accounting" },
  REALIZED_PNL_UPDATED: { eventType: "REALIZED_PNL_UPDATED", version: 1, introducedAt: "portfolio-accounting" },
  RISK_ALERT: { eventType: "RISK_ALERT", version: 1, introducedAt: "risk" },
  SAFE_MODE: { eventType: "SAFE_MODE", version: 1, introducedAt: "safety" }
};
