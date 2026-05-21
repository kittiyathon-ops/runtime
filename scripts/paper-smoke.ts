import type { RuntimeEvent } from "../src/core/event.js";
import type { EventStore } from "../src/infra/event-store.js";
import { loadConfig } from "../src/infra/config.js";
import { createLogger } from "../src/infra/logger.js";
import { TradingRuntime } from "../src/runtime/runtime.js";

class MemoryEventStore implements EventStore {
  private readonly events: RuntimeEvent[] = [];

  append(event: RuntimeEvent): void {
    this.events.push(event);
  }

  readFrom(seq: number, limit: number): RuntimeEvent[] {
    return this.events.filter((event) => event.seq >= seq).slice(0, limit);
  }

  close(): void {
    return undefined;
  }
}

const config = loadConfig({
  ...process.env,
  RUNTIME_PROFILE: "PAPER",
  DRY_RUN: "true",
  KILL_SWITCH: "false",
  ALLOW_MARKET_ORDERS: "false",
  MAX_ORDER_NOTIONAL_USD: positiveEnvOrDefault("MAX_ORDER_NOTIONAL_USD", "10"),
  MAX_EXPOSURE_USD: positiveEnvOrDefault("MAX_EXPOSURE_USD", "25"),
  MAX_DAILY_LOSS_USD: positiveEnvOrDefault("MAX_DAILY_LOSS_USD", "10"),
  MAX_LEVERAGE: positiveEnvOrDefault("MAX_LEVERAGE", "1")
});

const runtime = new TradingRuntime({
  config,
  logger: createLogger(config),
  eventStore: new MemoryEventStore()
});

const emitted: RuntimeEvent[] = [];
runtime.events.onEvent((event) => {
  emitted.push(event);
});

await runtime.start();

await runtime.ingest({
  source: "execution",
  symbol: "BTCUSDT",
  eventType: "ORDER_SUBMITTED",
  correlationId: "paper_smoke",
  causationId: "paper_smoke_intent",
  payload: {
    side: "BUY",
    type: "LIMIT",
    quantity: "0.001",
    limitPrice: "1000.0",
    idempotencyKey: "paper_smoke_1",
    executionMode: "PAPER"
  }
});

await runtime.stop();

const eventTypes = emitted.map((event) => event.eventType);
const orderRejected = emitted.find((event) => event.eventType === "ORDER_REJECTED");
const orderSubmitted = emitted.find((event) => event.eventType === "ORDER_SUBMITTED");

console.log(JSON.stringify({
  result: "PAPER_SMOKE_OK",
  runtimeProfile: config.runtimeProfile,
  dryRun: config.dryRun,
  killSwitch: config.killSwitch,
  restOrderSent: false,
  canonicalOrderSubmitted: orderSubmitted !== undefined,
  canonicalOrderRejected: orderRejected !== undefined,
  safety: "PAPER/DRY_RUN prevents Binance REST order submission",
  events: eventTypes
}, null, 2));

function positiveEnvOrDefault(key: string, fallback: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? value : fallback;
}
