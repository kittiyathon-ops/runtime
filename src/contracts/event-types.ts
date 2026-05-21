export type CanonicalEventType =
  | "MARKET_TICK"
  | "BOOK_UPDATE"
  | "SIGNAL_CREATED"
  | "INTENT_CREATED"
  | "ORDER_SUBMITTED"
  | "ORDER_ACCEPTED"
  | "ORDER_FILLED"
  | "ORDER_REJECTED"
  | "EXECUTION_ERROR"
  | "POSITION_UPDATED"
  | "RISK_ALERT"
  | "SAFE_MODE";

export type CompatibilityMode = "backward" | "forward" | "none";
