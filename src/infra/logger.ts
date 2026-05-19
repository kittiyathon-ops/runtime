import pino from "pino";
import type { RuntimeConfig } from "./config.js";

export function createLogger(config: Pick<RuntimeConfig, "logLevel">) {
  return pino({
    level: config.logLevel,
    base: { service: "trading-runtime" },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export type Logger = ReturnType<typeof createLogger>;
