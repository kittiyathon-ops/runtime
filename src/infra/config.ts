import "dotenv/config";
import { z } from "zod";

export const RuntimeProfileSchema = z.enum(["DEVELOPMENT", "PAPER", "REPLAY", "SAFE"]);

const RuntimeLimitsSchema = z.object({
  eventQueueCapacity: z.coerce.number().int().positive(),
  maxQueueDepth: z.coerce.number().int().nonnegative(),
  maxReplayLag: z.coerce.number().int().nonnegative(),
  hotPathWarnMs: z.coerce.number().int().positive(),
  staleDataHaltMs: z.coerce.number().int().positive(),
  latencyHaltMs: z.coerce.number().int().positive(),
  maxRejectRate: z.coerce.number().min(0).max(1),
  maxExposureUsd: z.coerce.number().positive(),
  maxDrawdownUsd: z.coerce.number().positive(),
  idempotencyCacheSize: z.coerce.number().int().positive()
});

const ResolvedRuntimeLimitsSchema = z.object({
  eventQueueCapacity: z.number().int().positive(),
  maxQueueDepth: z.number().int().nonnegative(),
  maxReplayLag: z.number().int().nonnegative(),
  hotPathWarnMs: z.number().int().positive(),
  staleDataHaltMs: z.number().int().positive(),
  latencyHaltMs: z.number().int().positive(),
  maxRejectRate: z.number().min(0).max(1),
  maxExposureUsd: z.number().positive(),
  maxDrawdownUsd: z.number().positive(),
  idempotencyCacheSize: z.number().int().positive()
});

export type RuntimeProfile = z.infer<typeof RuntimeProfileSchema>;
export type RuntimeLimits = z.infer<typeof RuntimeLimitsSchema>;

export const RUNTIME_PROFILE_LIMITS: Record<RuntimeProfile, RuntimeLimits> = {
  DEVELOPMENT: {
    eventQueueCapacity: 10_000,
    maxQueueDepth: 10_000,
    maxReplayLag: 10_000,
    hotPathWarnMs: 20,
    staleDataHaltMs: 1_000,
    latencyHaltMs: 250,
    maxRejectRate: 0.2,
    maxExposureUsd: 10_000,
    maxDrawdownUsd: 1_000,
    idempotencyCacheSize: 10_000
  },
  PAPER: {
    eventQueueCapacity: 25_000,
    maxQueueDepth: 20_000,
    maxReplayLag: 5_000,
    hotPathWarnMs: 15,
    staleDataHaltMs: 750,
    latencyHaltMs: 150,
    maxRejectRate: 0.1,
    maxExposureUsd: 5_000,
    maxDrawdownUsd: 500,
    idempotencyCacheSize: 25_000
  },
  REPLAY: {
    eventQueueCapacity: 50_000,
    maxQueueDepth: 50_000,
    maxReplayLag: 100_000,
    hotPathWarnMs: 50,
    staleDataHaltMs: 10_000,
    latencyHaltMs: 1_000,
    maxRejectRate: 0.5,
    maxExposureUsd: 100_000,
    maxDrawdownUsd: 100_000,
    idempotencyCacheSize: 100_000
  },
  SAFE: {
    eventQueueCapacity: 1_000,
    maxQueueDepth: 100,
    maxReplayLag: 100,
    hotPathWarnMs: 5,
    staleDataHaltMs: 250,
    latencyHaltMs: 50,
    maxRejectRate: 0.05,
    maxExposureUsd: 1_000,
    maxDrawdownUsd: 100,
    idempotencyCacheSize: 1_000
  }
};

const RawConfigSchema = z.object({
  nodeEnv: z.string().default("development"),
  runtimeProfile: RuntimeProfileSchema.default("DEVELOPMENT"),
  logLevel: z.string().default("info"),
  sqlitePath: z.string().default("./data/runtime.sqlite"),
  eventQueueCapacity: z.coerce.number().int().positive().optional(),
  maxQueueDepth: z.coerce.number().int().nonnegative().optional(),
  maxReplayLag: z.coerce.number().int().nonnegative().optional(),
  hotPathWarnMs: z.coerce.number().int().positive().optional(),
  staleDataHaltMs: z.coerce.number().int().positive().optional(),
  latencyHaltMs: z.coerce.number().int().positive().optional(),
  maxRejectRate: z.coerce.number().min(0).max(1).optional(),
  maxExposureUsd: z.coerce.number().positive().optional(),
  maxDrawdownUsd: z.coerce.number().positive().optional(),
  idempotencyCacheSize: z.coerce.number().int().positive().optional(),
  binanceFuturesWsUrl: z.string().url().default("wss://fstream.binance.com"),
  binanceApiKey: z.string().default(""),
  binanceApiSecret: z.string().default("")
});

export const ConfigSchema = RawConfigSchema.transform((config) => {
  const profileLimits = RUNTIME_PROFILE_LIMITS[config.runtimeProfile];
  return {
    ...config,
    eventQueueCapacity: config.eventQueueCapacity ?? profileLimits.eventQueueCapacity,
    maxQueueDepth: config.maxQueueDepth ?? profileLimits.maxQueueDepth,
    maxReplayLag: config.maxReplayLag ?? profileLimits.maxReplayLag,
    hotPathWarnMs: config.hotPathWarnMs ?? profileLimits.hotPathWarnMs,
    staleDataHaltMs: config.staleDataHaltMs ?? profileLimits.staleDataHaltMs,
    latencyHaltMs: config.latencyHaltMs ?? profileLimits.latencyHaltMs,
    maxRejectRate: config.maxRejectRate ?? profileLimits.maxRejectRate,
    maxExposureUsd: config.maxExposureUsd ?? profileLimits.maxExposureUsd,
    maxDrawdownUsd: config.maxDrawdownUsd ?? profileLimits.maxDrawdownUsd,
    idempotencyCacheSize: config.idempotencyCacheSize ?? profileLimits.idempotencyCacheSize
  };
}).pipe(z.object({
  nodeEnv: z.string(),
  runtimeProfile: RuntimeProfileSchema,
  logLevel: z.string(),
  sqlitePath: z.string(),
  binanceFuturesWsUrl: z.string().url(),
  binanceApiKey: z.string(),
  binanceApiSecret: z.string(),
  ...ResolvedRuntimeLimitsSchema.shape
}));

export type RuntimeConfig = z.infer<typeof ConfigSchema>;
export type RuntimeConfigInput = z.input<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return ConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    runtimeProfile: env.RUNTIME_PROFILE,
    logLevel: env.LOG_LEVEL,
    sqlitePath: env.SQLITE_PATH,
    eventQueueCapacity: env.EVENT_QUEUE_CAPACITY,
    maxQueueDepth: env.MAX_QUEUE_DEPTH,
    maxReplayLag: env.MAX_REPLAY_LAG,
    hotPathWarnMs: env.HOT_PATH_WARN_MS,
    staleDataHaltMs: env.STALE_DATA_HALT_MS,
    latencyHaltMs: env.LATENCY_HALT_MS,
    maxRejectRate: env.MAX_REJECT_RATE,
    maxExposureUsd: env.MAX_EXPOSURE_USD,
    maxDrawdownUsd: env.MAX_DRAWDOWN_USD,
    idempotencyCacheSize: env.IDEMPOTENCY_CACHE_SIZE,
    binanceFuturesWsUrl: env.BINANCE_FUTURES_WS_URL,
    binanceApiKey: env.BINANCE_API_KEY,
    binanceApiSecret: env.BINANCE_API_SECRET
  });
}
