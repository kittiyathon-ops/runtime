import { z } from "zod";
import type { CanonicalEventType } from "./event-types.js";
import { CURRENT_EVENT_VERSIONS } from "./event-versions.js";

export interface CanonicalEventContract {
  eventType: CanonicalEventType;
  version: number;
  payloadSchema: z.ZodType<Record<string, unknown>>;
}

const anyPayload = z.record(z.string(), z.unknown());
const numericPayload = z.record(z.string(), z.unknown()).refine((payload) =>
  Object.values(payload).every((value) => typeof value !== "number" || Number.isFinite(value)), "payload_numeric_values_must_be_finite");
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
const accountingPayload = z.record(z.string(), z.unknown()).and(z.object({
  amountUsd: decimalString
}).passthrough());
const accountingEventTypes = new Set<string>(["FEE_CHARGED", "FUNDING_FEE_APPLIED", "REALIZED_PNL_UPDATED"]);

export const CANONICAL_EVENT_CONTRACTS: CanonicalEventContract[] = Object.values(CURRENT_EVENT_VERSIONS).map((version) => ({
  eventType: version.eventType,
  version: version.version,
  payloadSchema: accountingEventTypes.has(version.eventType)
    ? accountingPayload
    : version.eventType === "MARKET_TICK" || version.eventType === "BOOK_UPDATE" || version.eventType === "ORDER_FILLED"
      ? numericPayload
      : anyPayload
}));
