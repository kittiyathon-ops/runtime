import { TradingRuntime } from "./runtime/runtime.js";
import type { RuntimeEvent } from "./core/event.js";

console.log("runtime started");

const runtime = new TradingRuntime();

runtime.events.onEvent((event: RuntimeEvent) => {
  if (event.eventType !== "MARKET_TICK") return;
  console.log("market tick", event);
});

await runtime.start();

process.once("SIGINT", () => {
  void runtime.stop();
});

process.once("SIGTERM", () => {
  void runtime.stop();
});
