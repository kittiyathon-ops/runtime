import "dotenv/config";
import { z } from "zod";

export const RuntimeProfileSchema = z.enum(["DEVELOPMENT", "PAPER", "LIVE", "REPLAY", "SAFE"]);

export const BINANCE_FUTURES_PRODUCTION_REST_URL = "https://fapi.binance.com";
export const BINANCE_FUTURES_TESTNET_REST_URL = "https://demo-fapi.binance.com";
export const BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL = "wss://fstream.binance.com";
export const BINANCE_FUTURES_TESTNET_MARKET_WS_BASE_URL = "wss://stream.binancefuture.com";
export const BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL = "wss://fstream.binance.com/private";
export const BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL = "wss://stream.binancefuture.com";
export const BINANCE_FUTURES_PRODUCTION_WS_API_URL = "wss://ws-fapi.binance.com/ws-fapi/v1";
export const BINANCE_FUTURES_TESTNET_WS_API_URL = "wss://testnet.binancefuture.com/ws-fapi/v1";

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
  idempotencyCacheSize: z.coerce.number().int().positive(),
  maxReorderWindowMs: z.coerce.number().int().nonnegative(),
  clockSkewAlertMs: z.coerce.number().int().positive()
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
  idempotencyCacheSize: z.number().int().positive(),
  maxReorderWindowMs: z.number().int().nonnegative(),
  clockSkewAlertMs: z.number().int().positive()
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
    idempotencyCacheSize: 10_000,
    maxReorderWindowMs: 250,
    clockSkewAlertMs: 1_000
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
    idempotencyCacheSize: 25_000,
    maxReorderWindowMs: 200,
    clockSkewAlertMs: 750
  },
  LIVE: {
    eventQueueCapacity: 25_000,
    maxQueueDepth: 10_000,
    maxReplayLag: 1_000,
    hotPathWarnMs: 10,
    staleDataHaltMs: 500,
    latencyHaltMs: 100,
    maxRejectRate: 0.05,
    maxExposureUsd: 1_000,
    maxDrawdownUsd: 100,
    idempotencyCacheSize: 50_000,
    maxReorderWindowMs: 100,
    clockSkewAlertMs: 500
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
    idempotencyCacheSize: 100_000,
    maxReorderWindowMs: 0,
    clockSkewAlertMs: 10_000
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
    idempotencyCacheSize: 1_000,
    maxReorderWindowMs: 50,
    clockSkewAlertMs: 250
  }
};

const RawConfigSchema = z.object({
  nodeEnv: z.string().default("development"),
  runtimeProfile: RuntimeProfileSchema.default("PAPER"),
  logLevel: z.string().default("info"),
  sqlitePath: z.string().default("./data/runtime.sqlite"),
  dryRun: z.boolean().default(true),
  eventQueueCapacity: z.coerce.number().int().positive().optional(),
  maxQueueDepth: z.coerce.number().int().nonnegative().optional(),
  maxReplayLag: z.coerce.number().int().nonnegative().optional(),
  hotPathWarnMs: z.coerce.number().int().positive().optional(),
  staleDataHaltMs: z.coerce.number().int().positive().optional(),
  latencyHaltMs: z.coerce.number().int().positive().optional(),
  maxRejectRate: z.coerce.number().min(0).max(1).optional(),
  maxExposureUsd: z.coerce.number().positive().optional(),
  maxDailyLossUsd: z.coerce.number().positive().default(100),
  maxOrderNotionalUsd: z.coerce.number().positive().default(10),
  maxLeverage: z.coerce.number().positive().default(1),
  maxDrawdownUsd: z.coerce.number().positive().optional(),
  idempotencyCacheSize: z.coerce.number().int().positive().optional(),
  maxReorderWindowMs: z.coerce.number().int().nonnegative().optional(),
  clockSkewAlertMs: z.coerce.number().int().positive().optional(),
  paperFillSimulationEnabled: z.boolean().default(false),
  paperFillSlippageBps: z.coerce.number().nonnegative().default(0),
  telegramAlertsEnabled: z.boolean().default(false),
  telegramBotToken: z.string().default(""),
  telegramChatId: z.string().default(""),
  telegramLanguage: z.string().default("en").transform((language) => language === "th" || language === "en" ? language : "en"),
  telegramAlertMode: z.string().default("verbose").transform((mode) => mode === "compact" || mode === "verbose" ? mode : "verbose"),
  liveTradingConfirmation: z.string().default(""),
  allowMarketOrders: z.boolean().default(false),
  killSwitch: z.boolean().default(false),
  binanceSymbols: z.union([z.string(), z.array(z.string())]).default("BTCUSDT").transform((symbols) => {
    const values = Array.isArray(symbols) ? symbols : symbols.split(",");
    return values.map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => symbol.length > 0);
  }),
  binanceUseTestnet: z.boolean().default(true),
  binanceFuturesRestUrl: z.string().url().optional(),
  binanceFuturesUserStreamBaseUrl: z.string().url().optional(),
  binanceFuturesMarketWsBaseUrl: z.string().url().optional(),
  binanceFuturesWsApiUrl: z.string().url().optional(),
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
    idempotencyCacheSize: config.idempotencyCacheSize ?? profileLimits.idempotencyCacheSize,
    maxReorderWindowMs: config.maxReorderWindowMs ?? profileLimits.maxReorderWindowMs,
    clockSkewAlertMs: config.clockSkewAlertMs ?? profileLimits.clockSkewAlertMs,
    binanceFuturesRestUrl: config.binanceFuturesRestUrl ?? (config.binanceUseTestnet ? BINANCE_FUTURES_TESTNET_REST_URL : BINANCE_FUTURES_PRODUCTION_REST_URL),
    binanceFuturesUserStreamBaseUrl: config.binanceFuturesUserStreamBaseUrl ?? (config.binanceUseTestnet ? BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL : BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL),
    binanceFuturesMarketWsBaseUrl: config.binanceFuturesMarketWsBaseUrl ?? (config.binanceUseTestnet ? BINANCE_FUTURES_TESTNET_MARKET_WS_BASE_URL : BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL),
    binanceFuturesWsApiUrl: config.binanceFuturesWsApiUrl ?? (config.binanceUseTestnet ? BINANCE_FUTURES_TESTNET_WS_API_URL : BINANCE_FUTURES_PRODUCTION_WS_API_URL)
  };
}).pipe(z.object({
  nodeEnv: z.string(),
  runtimeProfile: RuntimeProfileSchema,
  logLevel: z.string(),
  sqlitePath: z.string(),
  dryRun: z.boolean(),
  paperFillSimulationEnabled: z.boolean(),
  paperFillSlippageBps: z.number().nonnegative(),
  maxDailyLossUsd: z.number().positive(),
  maxOrderNotionalUsd: z.number().positive(),
  maxLeverage: z.number().positive(),
  telegramAlertsEnabled: z.boolean(),
  telegramBotToken: z.string(),
  telegramChatId: z.string(),
  telegramLanguage: z.enum(["th", "en"]),
  telegramAlertMode: z.enum(["compact", "verbose"]),
  liveTradingConfirmation: z.string(),
  allowMarketOrders: z.boolean(),
  killSwitch: z.boolean(),
  binanceSymbols: z.array(z.string().min(1)),
  binanceUseTestnet: z.boolean(),
  binanceFuturesRestUrl: z.string().url(),
  binanceFuturesUserStreamBaseUrl: z.string().url(),
  binanceFuturesMarketWsBaseUrl: z.string().url(),
  binanceFuturesWsApiUrl: z.string().url(),
  binanceApiKey: z.string(),
  binanceApiSecret: z.string(),
  ...ResolvedRuntimeLimitsSchema.shape
}).superRefine((config, ctx) => {
  if (!config.telegramAlertsEnabled) return;
  if (config.telegramBotToken.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["telegramBotToken"],
      message: "telegram_bot_token_required"
    });
  }
  if (config.telegramChatId.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["telegramChatId"],
      message: "telegram_chat_id_required"
    });
  }
}).superRefine((config, ctx) => {
  if (config.runtimeProfile !== "LIVE") return;
  for (const issue of validateBinanceEndpointMode(config)) {
    ctx.addIssue({
      code: "custom",
      path: [issue.path],
      message: issue.message
    });
  }
}));

export type RuntimeConfig = z.infer<typeof ConfigSchema>;
export type RuntimeConfigInput = z.input<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return ConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    runtimeProfile: env.RUNTIME_PROFILE,
    logLevel: env.LOG_LEVEL,
    sqlitePath: env.SQLITE_PATH,
    dryRun: env.DRY_RUN === undefined ? undefined : env.DRY_RUN === "true",
    eventQueueCapacity: env.EVENT_QUEUE_CAPACITY,
    maxQueueDepth: env.MAX_QUEUE_DEPTH,
    maxReplayLag: env.MAX_REPLAY_LAG,
    hotPathWarnMs: env.HOT_PATH_WARN_MS,
    staleDataHaltMs: env.STALE_DATA_HALT_MS,
    latencyHaltMs: env.LATENCY_HALT_MS,
    maxRejectRate: env.MAX_REJECT_RATE,
    maxExposureUsd: env.MAX_EXPOSURE_USD,
    maxDailyLossUsd: env.MAX_DAILY_LOSS_USD,
    maxOrderNotionalUsd: env.MAX_ORDER_NOTIONAL_USD,
    maxLeverage: env.MAX_LEVERAGE,
    maxDrawdownUsd: env.MAX_DRAWDOWN_USD,
    idempotencyCacheSize: env.IDEMPOTENCY_CACHE_SIZE,
    maxReorderWindowMs: env.MAX_REORDER_WINDOW_MS,
    clockSkewAlertMs: env.CLOCK_SKEW_ALERT_MS,
    paperFillSimulationEnabled: env.PAPER_FILL_SIMULATION_ENABLED === "true",
    paperFillSlippageBps: env.PAPER_FILL_SLIPPAGE_BPS,
    telegramAlertsEnabled: env.TELEGRAM_ALERTS_ENABLED === "true",
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    telegramLanguage: env.TELEGRAM_LANGUAGE,
    telegramAlertMode: env.TELEGRAM_ALERT_MODE,
    liveTradingConfirmation: env.LIVE_TRADING_CONFIRMATION,
    allowMarketOrders: env.ALLOW_MARKET_ORDERS === "true",
    killSwitch: env.KILL_SWITCH === "true",
    binanceSymbols: env.BINANCE_SYMBOLS,
    binanceUseTestnet: env.BINANCE_USE_TESTNET === undefined ? undefined : env.BINANCE_USE_TESTNET === "true",
    binanceFuturesRestUrl: env.BINANCE_FUTURES_REST_URL,
    binanceFuturesUserStreamBaseUrl: env.BINANCE_FUTURES_USER_STREAM_BASE_URL,
    binanceFuturesMarketWsBaseUrl: env.BINANCE_FUTURES_MARKET_WS_BASE_URL,
    binanceFuturesWsApiUrl: env.BINANCE_FUTURES_WS_API_URL,
    binanceApiKey: env.BINANCE_API_KEY,
    binanceApiSecret: env.BINANCE_API_SECRET
  });
}

export function validateBinanceEndpointMode(config: Pick<RuntimeConfig, "binanceUseTestnet" | "binanceFuturesRestUrl" | "binanceFuturesUserStreamBaseUrl" | "binanceFuturesMarketWsBaseUrl" | "binanceFuturesWsApiUrl">): Array<{ path: keyof RuntimeConfig; message: string }> {
  const endpoints = {
    binanceFuturesRestUrl: normalizeEndpoint(config.binanceFuturesRestUrl),
    binanceFuturesUserStreamBaseUrl: normalizeEndpoint(config.binanceFuturesUserStreamBaseUrl),
    binanceFuturesMarketWsBaseUrl: normalizeEndpoint(config.binanceFuturesMarketWsBaseUrl),
    binanceFuturesWsApiUrl: normalizeEndpoint(config.binanceFuturesWsApiUrl)
  };
  const expected = config.binanceUseTestnet
    ? {
      binanceFuturesRestUrl: BINANCE_FUTURES_TESTNET_REST_URL,
      binanceFuturesUserStreamBaseUrl: BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL,
      binanceFuturesMarketWsBaseUrl: BINANCE_FUTURES_TESTNET_MARKET_WS_BASE_URL,
      binanceFuturesWsApiUrl: BINANCE_FUTURES_TESTNET_WS_API_URL
    }
    : {
      binanceFuturesRestUrl: BINANCE_FUTURES_PRODUCTION_REST_URL,
      binanceFuturesUserStreamBaseUrl: BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL,
      binanceFuturesMarketWsBaseUrl: BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL,
      binanceFuturesWsApiUrl: BINANCE_FUTURES_PRODUCTION_WS_API_URL
    };

  const issues: Array<{ path: keyof RuntimeConfig; message: string }> = [];
  for (const [path, actual] of Object.entries(endpoints) as Array<[keyof typeof endpoints, string]>) {
    const expectedUrl = expected[path];
    if (actual !== normalizeEndpoint(expectedUrl)) {
      issues.push({
        path,
        message: config.binanceUseTestnet
          ? `binance_testnet_endpoint_mismatch:${path}:expected_${expectedUrl}:got_${actual}`
          : `binance_production_endpoint_mismatch:${path}:expected_${expectedUrl}:got_${actual}`
      });
    }
  }
  return issues;
}

function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "");
}
