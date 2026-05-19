import { z } from "zod";

export const EventTypeSchema = z.enum([
  "MARKET_TICK",
  "BOOK_UPDATE",
  "SIGNAL_CREATED",
  "INTENT_CREATED",
  "ORDER_SUBMITTED",
  "ORDER_FILLED",
  "ORDER_REJECTED",
  "POSITION_UPDATED",
  "RISK_ALERT",
  "SAFE_MODE"
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const SourceSchema = z.enum([
  "binance_market_ws",
  "binance_user_ws",
  "runtime",
  "risk",
  "execution",
  "portfolio",
  "replay",
  "test"
]);

export type EventSource = z.infer<typeof SourceSchema>;

export const RuntimeEventSchema = z.object({
  eventId: z.string().min(1).optional(),
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  exchangeTimestamp: z.number().int().nonnegative().optional(),
  receiveTimestamp: z.number().int().nonnegative().optional(),
  processingTimestamp: z.number().int().nonnegative().optional(),
  source: SourceSchema,
  symbol: z.string().min(1),
  eventType: EventTypeSchema,
  correlationId: z.string().min(1),
  causationId: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export type EventInput = Omit<RuntimeEvent, "seq" | "timestamp" | "processingTimestamp"> & {
  seq?: number;
  timestamp?: number;
  processingTimestamp?: number;
};

export function validateEvent(event: RuntimeEvent): RuntimeEvent {
  return RuntimeEventSchema.parse(event);
}

export function isTradingIntent(event: RuntimeEvent): boolean {
  return event.eventType === "INTENT_CREATED";
}
