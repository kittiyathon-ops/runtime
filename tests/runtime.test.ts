import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { TradingRuntime } from "../src/runtime/runtime.js";
import { TelegramNotifier, type AlertNotifier } from "../src/alerts/telegram-notifier.js";
import { ConfigSchema, RUNTIME_PROFILE_LIMITS, type RuntimeConfig, type RuntimeProfile } from "../src/infra/config.js";
import { createLogger } from "../src/infra/logger.js";
import { RuntimeEventSchema, type EventInput, type RuntimeEvent } from "../src/core/event.js";
import type { AuditEntry, AuditRecord } from "../src/audit/audit-log.js";
import { ExecutionEngine } from "../src/execution/execution-engine.js";
import { PaperPerformanceTracker } from "../src/execution/paper-performance-tracker.js";
import { PortfolioState } from "../src/portfolio/portfolio-state.js";
import { RiskEngine } from "../src/risk/risk-engine.js";
import {
  SpreadWideningSignalProvider,
  type SignalProvider,
  type SignalToIntentPolicy
} from "../src/signals/signal-engine.js";

class MemoryEventStore {
  readonly events: RuntimeEvent[] = [];
  closeCount = 0;

  append(event: RuntimeEvent): void {
    this.events.push(event);
  }

  readFrom(seq: number, limit: number): RuntimeEvent[] {
    return this.events.filter((event) => event.seq >= seq).slice(0, limit);
  }

  close(): void {
    this.closeCount += 1;
  }
}

class MemoryAuditLog {
  readonly records: AuditRecord[] = [];

  record(record: AuditRecord): void {
    this.records.push(record);
  }

  entries(action: string): AuditEntry[] {
    return this.records.filter((record): record is AuditEntry => "action" in record && record.action === action);
  }
}

class MemoryNotifier implements AlertNotifier {
  readonly messages: string[] = [];

  async sendAlert(message: string): Promise<void> {
    this.messages.push(message);
  }
}

function eventWithSeq(seq: number, eventId?: string): RuntimeEvent {
  return {
    ...(eventId === undefined ? {} : { eventId }),
    seq,
    timestamp: 1_700_000_000_000 + seq,
    receiveTimestamp: 1_700_000_000_000 + seq,
    processingTimestamp: 1_700_000_000_000 + seq,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_replay",
    causationId: "test",
    payload: { bid: 100 + seq, ask: 101 + seq }
  };
}

function eventInputWithSeq(seq: number, eventId?: string): EventInput {
  return {
    ...(eventId === undefined ? {} : { eventId }),
    seq,
    timestamp: 1_700_000_000_000 + seq,
    receiveTimestamp: 1_700_000_000_000 + seq,
    processingTimestamp: 1_700_000_000_000 + seq,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_replay_bypass",
    causationId: "test",
    payload: { bid: 100 + seq, ask: 101 + seq }
  };
}

const baseConfig: RuntimeConfig = {
  nodeEnv: "test",
  runtimeProfile: "DEVELOPMENT",
  logLevel: "silent",
  sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite"),
  eventQueueCapacity: 100,
  maxQueueDepth: 100,
  maxReplayLag: 100,
  hotPathWarnMs: 20,
  staleDataHaltMs: 1_000,
  latencyHaltMs: 250,
  maxRejectRate: 0.5,
  maxExposureUsd: 10_000,
  maxDrawdownUsd: 1_000,
  idempotencyCacheSize: 100,
  paperFillSimulationEnabled: false,
  paperFillSlippageBps: 0,
  telegramAlertsEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  binanceFuturesWsUrl: "wss://fstream.binance.com",
  binanceApiKey: "",
  binanceApiSecret: ""
};

function profileConfig(runtimeProfile: RuntimeProfile): RuntimeConfig {
  return ConfigSchema.parse({
    nodeEnv: "test",
    runtimeProfile,
    logLevel: "silent",
    sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite")
  });
}

const testSignalToIntentPolicy: SignalToIntentPolicy = {
  id: "test_signal_to_intent_policy",
  evaluate: (signal) => {
    if (signal.payload.signalType !== "SPREAD_WIDENING") {
      return { allow: false, reason: "unsupported_test_signal" };
    }
    return {
      allow: true,
      intent: {
        payload: {
          side: "BUY",
          type: "MARKET",
          quantity: 1,
          topOfBookQuantity: 10,
          reduceOnly: false
        }
      }
    };
  }
};

test("runtime starts in NORMAL and checkpoints ingested market data", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.seq, 1);
  assert.equal(eventStore.events.length, 1);
  assert.equal(eventStore.events[0]?.eventType, "MARKET_TICK");
  assert.equal(RuntimeEventSchema.parse(eventStore.events[0]).seq, 1);
  await runtime.stop();
});

test("audit logs accepted event", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_audit_accept",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  const accepted = audit.entries("event_accepted");
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.seq, 1);
  assert.equal(accepted[0]?.eventType, "MARKET_TICK");
  assert.equal(accepted[0]?.correlationId, "corr_audit_accept");

  await runtime.stop();
});

test("runtime startup audit includes active profile and limits", async () => {
  const audit = new MemoryAuditLog();
  const config = profileConfig("PAPER");
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });

  await runtime.start();

  const started = audit.entries("runtime_started");
  assert.equal(started.length, 1);
  assert.equal(started[0]?.runtimeProfile, "PAPER");
  assert.equal(started[0]?.limits?.latencyHaltMs, RUNTIME_PROFILE_LIMITS.PAPER.latencyHaltMs);
  assert.equal(started[0]?.limits?.idempotencyCacheSize, RUNTIME_PROFILE_LIMITS.PAPER.idempotencyCacheSize);

  await runtime.stop();
});

test("invalid config fails startup closed", () => {
  assert.throws(() => {
    new TradingRuntime({
      config: { runtimeProfile: "PAPER", latencyHaltMs: 0 },
      eventStore: new MemoryEventStore()
    });
  }, /Too small|Number must be greater than 0/);
});

test("Telegram alerts fail closed when explicitly enabled without config", () => {
  assert.throws(
    () =>
      ConfigSchema.parse({
        telegramAlertsEnabled: true,
        telegramBotToken: "",
        telegramChatId: "123"
      }),
    /telegram_bot_token_required/
  );
  assert.throws(
    () =>
      ConfigSchema.parse({
        telegramAlertsEnabled: true,
        telegramBotToken: "token",
        telegramChatId: ""
      }),
    /telegram_chat_id_required/
  );
});

test("TelegramNotifier sends alerts with mocked fetch", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const notifier = new TelegramNotifier(
    { telegramAlertsEnabled: true, telegramBotToken: "test_token", telegramChatId: "chat_1" },
    async (url, init) => {
      calls.push({ url, body: init.body });
      return { ok: true, status: 200, text: async () => "ok" };
    }
  );

  await notifier.sendAlert("runtime started");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.telegram.org/bottest_token/sendMessage");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    chat_id: "chat_1",
    text: "runtime started",
    disable_web_page_preview: true
  });
});

test("each runtime profile loads expected limits", async () => {
  const profiles: RuntimeProfile[] = ["DEVELOPMENT", "PAPER", "REPLAY", "SAFE"];

  for (const runtimeProfile of profiles) {
    const config = profileConfig(runtimeProfile);
    const expected = RUNTIME_PROFILE_LIMITS[runtimeProfile];
    assert.equal(config.eventQueueCapacity, expected.eventQueueCapacity);
    assert.equal(config.maxQueueDepth, expected.maxQueueDepth);
    assert.equal(config.maxReplayLag, expected.maxReplayLag);
    assert.equal(config.hotPathWarnMs, expected.hotPathWarnMs);
    assert.equal(config.staleDataHaltMs, expected.staleDataHaltMs);
    assert.equal(config.latencyHaltMs, expected.latencyHaltMs);
    assert.equal(config.maxRejectRate, expected.maxRejectRate);
    assert.equal(config.maxExposureUsd, expected.maxExposureUsd);
    assert.equal(config.maxDrawdownUsd, expected.maxDrawdownUsd);
    assert.equal(config.idempotencyCacheSize, expected.idempotencyCacheSize);

    const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore() });
    await runtime.start();
    assert.equal(runtime.state.mode(), "NORMAL");
    await runtime.stop();
  }
});

test("SAFE profile uses stricter thresholds", () => {
  const development = profileConfig("DEVELOPMENT");
  const safe = profileConfig("SAFE");

  assert.ok(safe.maxQueueDepth < development.maxQueueDepth);
  assert.ok(safe.maxReplayLag < development.maxReplayLag);
  assert.ok(safe.hotPathWarnMs < development.hotPathWarnMs);
  assert.ok(safe.staleDataHaltMs < development.staleDataHaltMs);
  assert.ok(safe.latencyHaltMs < development.latencyHaltMs);
  assert.ok(safe.maxRejectRate < development.maxRejectRate);
  assert.ok(safe.maxExposureUsd < development.maxExposureUsd);
  assert.ok(safe.maxDrawdownUsd < development.maxDrawdownUsd);
  assert.ok(safe.idempotencyCacheSize < development.idempotencyCacheSize);
});

test("audit logs rejected invalid event", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "",
      eventType: "MARKET_TICK",
      correlationId: "corr_audit_reject",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /Too small/
  );

  const rejected = audit.entries("event_rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.eventType, "MARKET_TICK");
  assert.equal(rejected[0]?.correlationId, "corr_audit_reject");
  assert.match(rejected[0]?.reason ?? "", /Too small/);

  await runtime.stop();
});

test("duplicate seq is rejected and audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    seq: 7,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_dup_seq",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      seq: 7,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_dup_seq_2",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_seq:7/
  );

  assert.deepEqual(eventStore.events.map((event) => event.seq), [7]);
  const rejected = audit.entries("event_rejected");
  assert.equal(rejected.at(-1)?.seq, 7);
  assert.equal(rejected.at(-1)?.reason, "duplicate_seq:7");

  await runtime.stop();
});

test("duplicate eventId is rejected", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    eventId: "evt_dup",
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_dup_event_id_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      eventId: "evt_dup",
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_dup_event_id_2",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_event_id:evt_dup/
  );

  assert.equal(eventStore.events.length, 1);
  assert.equal(eventStore.events[0]?.eventId, "evt_dup");

  await runtime.stop();
});

test("runtime accepts valid mode transitions", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  runtime.transitionMode("PAPER");
  assert.equal(runtime.state.mode(), "PAPER");
  runtime.transitionMode("NORMAL");
  assert.equal(runtime.state.mode(), "NORMAL");
  runtime.transitionMode("REPLAY");
  assert.equal(runtime.state.mode(), "REPLAY");
  runtime.transitionMode("NORMAL");
  assert.equal(runtime.state.mode(), "NORMAL");
  runtime.transitionMode("SAFE_MODE");
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  runtime.transitionMode("HALTED");
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("invalid mode transitions fail closed", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  runtime.transitionMode("SAFE_MODE");
  assert.throws(() => {
    runtime.transitionMode("NORMAL");
  }, /invalid_runtime_transition:SAFE_MODE->NORMAL/);
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("valid intent creates submitted order event", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_2",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_2",
    causationId: "signal_1",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.seq, 3);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(RuntimeEventSchema.parse(published[2]).seq, 3);
  assert.equal(published[2]?.source, "execution");
  assert.equal(published[2]?.payload.status, "SUBMITTED");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(eventStore.events[2]?.payload.status, "SUBMITTED");
  await runtime.stop();
});

test("ExecutionEngine refuses simulated execution in SAFE_MODE and HALTED", () => {
  const portfolio = new PortfolioState();
  const risk = new RiskEngine(baseConfig, portfolio);
  const execution = new ExecutionEngine(risk);
  const intent = RuntimeEventSchema.parse({
    seq: 1,
    timestamp: Date.now(),
    receiveTimestamp: Date.now(),
    processingTimestamp: Date.now(),
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_execution_mode",
    causationId: "signal_execution_mode",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.deepEqual(execution.simulate(intent, "SAFE_MODE", () => 2, Date.now()), { accepted: false, events: [] });
  assert.deepEqual(execution.simulate(intent, "HALTED", () => 2, Date.now()), { accepted: false, events: [] });
});

test("duplicate ORDER_SUBMITTED is not generated for same correlation and causation", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_order_dup",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_order_dup",
    causationId: "signal_dup",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "INTENT_CREATED",
      correlationId: "corr_order_dup",
      causationId: "signal_dup",
      payload: { side: "BUY", type: "MARKET", quantity: 1 }
    }),
    /duplicate_order_submission:corr_order_dup:signal_dup/
  );

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);

  await runtime.stop();
});

test("SELL intent does not trigger SAFE_MODE by itself", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_3",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_3",
    causationId: "signal_2",
    payload: { side: "SELL", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, false);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(published[2]?.payload.side, "SELL");
  await runtime.stop();
});

test("stale market data triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1, sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite") };
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  const staleTimestamp = Date.now() - 10_000;
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_4",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_4",
    causationId: "signal_3",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(published[1]?.payload.reason, "stale_data_halt");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(eventStore.events[1]?.payload.reason, "stale_data_halt");
  await runtime.stop();
});

test("Binance market payloads normalize into canonical RuntimeEvents", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();

  await runtime.ingestBinanceMarketPayload("bookTicker", "btcusdt", {
    u: 10,
    b: "100.1",
    B: "2.5",
    a: "100.2",
    A: "3.5",
    E: 1_700_000_000_000
  }, 1_700_000_000_100);
  await runtime.ingestBinanceMarketPayload("trade", "btcusdt", {
    t: 11,
    p: "100.15",
    q: "0.25",
    m: true,
    T: 1_700_000_000_010,
    E: 1_700_000_000_020
  }, 1_700_000_000_110);
  await runtime.ingestBinanceMarketPayload("markPrice", "btcusdt", {
    s: "BTCUSDT",
    p: "100.12",
    i: "100.10",
    P: "100.11",
    r: "0.0001",
    T: 1_700_000_001_000,
    E: 1_700_000_000_120
  }, 1_700_000_000_120);

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["BOOK_UPDATE", "MARKET_TICK", "MARKET_TICK"]);
  assert.equal(eventStore.events[0]?.source, "binance_market_ws");
  assert.equal(eventStore.events[0]?.payload.stream, "bookTicker");
  assert.equal(eventStore.events[1]?.payload.stream, "trade");
  assert.equal(eventStore.events[2]?.payload.stream, "markPrice");
  assert.equal(RuntimeEventSchema.parse(eventStore.events[0]).payload.bidPrice, 100.1);

  await runtime.stop();
});

test("malformed Binance payloads are rejected and enter SAFE_MODE", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await assert.rejects(
    runtime.ingestBinanceMarketPayload("bookTicker", "BTCUSDT", {
      u: 10,
      b: "100.1",
      a: "100.2",
      A: "3.5"
    }),
    /malformed_exchange_payload:B/
  );

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["SAFE_MODE"]);
  assert.equal(eventStore.events[0]?.payload.reason, "malformed_exchange_payload");
  assert.equal(audit.entries("safe_mode_entered")[0]?.reason, "malformed_exchange_payload");

  await runtime.stop();
});

test("stale websocket stream lifecycle triggers SAFE_MODE", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await runtime.handleMarketStreamLifecycle({
    action: "stale_stream_detected",
    symbol: "ETHUSDT",
    stream: "trade",
    reason: "stale_market_stream"
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(eventStore.events[0]?.eventType, "SAFE_MODE");
  assert.equal(eventStore.events[0]?.payload.reason, "stale_market_stream");
  assert.equal(audit.entries("market_stream_stale_stream_detected").length, 1);

  await runtime.stop();
});

test("websocket disconnect enters SAFE_MODE and reconnect recovery is audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  await runtime.start();

  await runtime.handleMarketStreamLifecycle({
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "bookTicker",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketStreamLifecycle({
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "bookTicker",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketStreamLifecycle({
    action: "connected",
    symbol: "BTCUSDT",
    stream: "bookTicker"
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(eventStore.events[0]?.payload.reason, "websocket_disconnect");
  assert.equal(audit.entries("market_stream_disconnected").length, 1);
  assert.equal(audit.entries("market_stream_reconnecting").length, 1);
  assert.equal(audit.entries("market_stream_connected").length, 1);

  await runtime.stop();
});

test("ORDER_FILLED updates PortfolioState", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_fill_portfolio",
    causationId: "order_1",
    payload: { quantity: 2, price: 100, unrealizedPnl: 5 }
  });

  assert.deepEqual(runtime.portfolio.snapshot().positions["BTCUSDT"], {
    symbol: "BTCUSDT",
    quantity: 2,
    averagePrice: 100,
    unrealizedPnl: 5
  });
  assert.equal(runtime.state.mode(), "NORMAL");

  await runtime.stop();
});

test("POSITION_UPDATED updates PortfolioState", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_portfolio",
    causationId: "account_update",
    payload: { quantity: -3, price: 200, unrealizedPnl: -7 }
  });

  assert.deepEqual(runtime.portfolio.snapshot().positions["ETHUSDT"], {
    symbol: "ETHUSDT",
    quantity: -3,
    averagePrice: 200,
    unrealizedPnl: -7
  });
  assert.equal(runtime.state.mode(), "NORMAL");

  await runtime.stop();
});

test("matching position reconciliation does not trigger SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_position_match",
    causationId: "order_2",
    payload: { quantity: 4, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_match",
    causationId: "account_update",
    payload: { quantity: 4, price: 100 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, false);

  await runtime.stop();
});

test("mismatched position triggers SAFE_MODE and audit", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_position_mismatch",
    causationId: "order_3",
    payload: { quantity: 5, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_position_mismatch",
    causationId: "account_update",
    payload: { quantity: 3, price: 100 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  const mismatches = audit.entries("position_mismatch");
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.symbol, "BTCUSDT");
  assert.equal(mismatches[0]?.expectedPosition, 5);
  assert.equal(mismatches[0]?.actualPosition, 3);
  assert.equal(mismatches[0]?.reason, "position_mismatch");

  await runtime.stop();
});

test("runtime refuses DRY_RUN order submission after mismatch SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "order_4",
    payload: { quantity: 6, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "POSITION_UPDATED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "account_update",
    payload: { quantity: 1, price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_mismatch_blocks_order",
    causationId: "signal_after_mismatch",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);

  await runtime.stop();
});

test("audit logs SAFE_MODE entry", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1, sqlitePath: join(mkdtempSync(join(tmpdir(), "trading-runtime-")), "runtime.sqlite") };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  const staleTimestamp = Date.now() - 10_000;

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_audit_safe",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_audit_safe",
    causationId: "signal_audit_safe",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const safeMode = audit.entries("safe_mode_entered");
  assert.equal(safeMode.length, 1);
  assert.equal(safeMode[0]?.eventType, "INTENT_CREATED");
  assert.equal(safeMode[0]?.correlationId, "corr_audit_safe");
  assert.equal(safeMode[0]?.reason, "stale_data_halt");

  await runtime.stop();
});

test("runtime refuses simulated order submission in SAFE_MODE", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_5",
    causationId: "signal_4",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_5",
    causationId: "signal_5",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(runtime.checkpoints.latest()?.risk.killSwitch, true);
  assert.deepEqual(published.map((event) => event.eventType), ["SAFE_MODE", "SAFE_MODE"]);
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  await runtime.stop();
});

test("audit logs DRY_RUN order simulation", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_audit_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_audit_order",
    causationId: "signal_audit_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const dryRun = audit.entries("dry_run_order_submitted_generated");
  assert.equal(dryRun.length, 1);
  assert.equal(dryRun[0]?.seq, 3);
  assert.equal(dryRun[0]?.eventType, "ORDER_SUBMITTED");
  assert.equal(dryRun[0]?.correlationId, "corr_audit_order");

  await runtime.stop();
});

test("runtime sends Telegram alerts through notifier integration", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true };
  const notifier = new MemoryNotifier();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, notifier });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_alerts",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_alerts",
    causationId: "signal_alerts",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });
  await runtime.handleMarketStreamLifecycle({
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketStreamLifecycle({
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "trade",
    reason: "websocket_disconnect"
  });
  await runtime.stop();

  assert.equal(notifier.messages.some((message) => message.includes("TradingRuntime started")), true);
  assert.equal(notifier.messages.some((message) => message.includes("DRY_RUN ORDER_SUBMITTED")), true);
  assert.equal(notifier.messages.some((message) => message.includes("Simulated ORDER_FILLED")), true);
  assert.equal(notifier.messages.some((message) => message.includes("Paper PnL updated")), true);
  assert.equal(notifier.messages.some((message) => message.includes("Websocket reconnecting")), true);
  assert.equal(notifier.messages.some((message) => message.includes("Websocket disconnected")), true);
  assert.equal(notifier.messages.some((message) => message.includes("SAFE_MODE entered")), true);
  assert.equal(notifier.messages.some((message) => message.includes("TradingRuntime stopped")), true);
});

test("generated ORDER_SUBMITTED is persisted and audited", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_persist_audit_order",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_persist_audit_order",
    causationId: "signal_persist_audit_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  const submitted = eventStore.events.find((event) => event.eventType === "ORDER_SUBMITTED");
  assert.equal(submitted?.source, "execution");
  assert.equal(submitted?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);
  assert.equal(audit.entries("event_accepted").some((entry) => entry.eventType === "ORDER_SUBMITTED"), true);

  await runtime.stop();
});

test("DRY_RUN order can generate simulated paper fill", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 5 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_paper_fill",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_paper_fill",
    causationId: "signal_paper_fill",
    payload: { side: "BUY", type: "MARKET", quantity: 2, topOfBookQuantity: 10 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "MARKET_TICK",
    "INTENT_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_FILLED"
  ]);
  const fill = eventStore.events[3];
  assert.equal(fill?.source, "execution");
  assert.equal(fill?.payload.status, "FILLED");
  assert.equal(fill?.payload.simulator, "paper_fill");
  assert.equal(fill?.payload.slippageBps, 5);
  assert.equal(fill?.payload.price, 101 * 1.0005);
  assert.equal(audit.entries("paper_fill_generated").length, 1);

  const health = runtime.healthSnapshot();
  assert.equal(health.paperFillsGenerated, 1);
  assert.equal(health.simulatedSlippageBps, 5);
  assert.equal(health.simulatedNotionalUsd, 2 * 101 * 1.0005);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("simulated paper fill updates PortfolioState", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 0 };
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_paper_portfolio",
    causationId: "market",
    payload: { bidPrice: 200, askPrice: 201 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_paper_portfolio",
    causationId: "signal_paper_portfolio",
    payload: { side: "BUY", type: "MARKET", quantity: 3, topOfBookQuantity: 10 }
  });

  const position = runtime.portfolio.snapshot().positions.ETHUSDT;
  assert.equal(position?.quantity, 3);
  assert.equal(position?.averagePrice, 201);
  assert.equal(runtime.portfolio.exposureUsd(), 603);

  await runtime.stop();
});

test("missing market snapshot prevents paper fill generation", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_missing_snapshot",
    causationId: "market",
    payload: { price: 100 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_missing_snapshot",
    causationId: "signal_missing_snapshot",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "INTENT_CREATED", "ORDER_SUBMITTED"]);
  assert.equal(audit.entries("paper_fill_skipped").length, 1);
  assert.equal(audit.entries("paper_fill_skipped")[0]?.reason, "missing_market_snapshot");
  assert.equal(runtime.healthSnapshot().paperFillsGenerated, 0);

  await runtime.stop();
});

test("SAFE_MODE and HALTED prevent paper fills", async () => {
  const config = { ...baseConfig, paperFillSimulationEnabled: true, paperFillSlippageBps: 0 };
  const safeAudit = new MemoryAuditLog();
  const safeStore = new MemoryEventStore();
  const safeRuntime = new TradingRuntime({ config, logger: createLogger(config), eventStore: safeStore, audit: safeAudit });

  await safeRuntime.start();
  await safeRuntime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_safe_paper_fill",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  safeRuntime.transitionMode("SAFE_MODE");
  await safeRuntime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_SUBMITTED",
    correlationId: "corr_safe_paper_fill",
    causationId: "manual_order",
    payload: { side: "BUY", type: "MARKET", quantity: 1, status: "SUBMITTED" }
  });

  assert.deepEqual(safeStore.events.map((event) => event.eventType), ["MARKET_TICK", "ORDER_SUBMITTED"]);
  assert.equal(safeAudit.entries("paper_fill_skipped")[0]?.reason, "runtime_mode_disallows_paper_fill");
  assert.equal(safeRuntime.healthSnapshot().paperFillsGenerated, 0);
  await safeRuntime.stop();

  const haltedStore = new MemoryEventStore();
  const haltedRuntime = new TradingRuntime({ config, logger: createLogger(config), eventStore: haltedStore });
  await haltedRuntime.start();
  haltedRuntime.transitionMode("HALTED");
  await assert.rejects(
    haltedRuntime.ingest({
      source: "execution",
      symbol: "BTCUSDT",
      eventType: "ORDER_SUBMITTED",
      correlationId: "corr_halted_paper_fill",
      causationId: "manual_order",
      payload: { side: "BUY", type: "MARKET", quantity: 1, status: "SUBMITTED" }
    }),
    /runtime_shutdown/
  );
  assert.equal(haltedStore.events.length, 0);
  assert.equal(haltedRuntime.healthSnapshot().paperFillsGenerated, 0);
  await haltedRuntime.stop();
});

test("paper performance long fill updates exposure and average price", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_long",
    causationId: "order_perf_long",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.currentExposureUsd, 200);
  assert.equal(snapshot.averageFillPrice, 100);
  assert.equal(snapshot.positions.BTCUSDT?.quantity, 2);
  assert.equal(snapshot.positions.BTCUSDT?.averagePrice, 100);
  assert.equal(audit.entries("paper_performance_updated").length, 1);
  assert.equal(eventStore.events[0]?.eventType, "ORDER_FILLED");

  await runtime.stop();
});

test("paper performance closing fill realizes PnL", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_win",
    causationId: "order_perf_open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_win",
    causationId: "order_perf_close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -2, price: 110, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, 20);
  assert.equal(snapshot.totalTrades, 1);
  assert.equal(snapshot.winningTrades, 1);
  assert.equal(snapshot.losingTrades, 0);
  assert.equal(snapshot.winRate, 1);
  assert.equal(snapshot.grossProfitUsd, 20);
  assert.equal(snapshot.currentExposureUsd, 0);

  const health = runtime.healthSnapshot();
  assert.equal(health.paperRealizedPnlUsd, 20);
  assert.equal(health.paperWinRate, 1);

  await runtime.stop();
});

test("paper performance losing trade updates gross loss", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "ETHUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_loss",
    causationId: "order_loss_open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "ETHUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_loss",
    causationId: "order_loss_close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 90, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, -10);
  assert.equal(snapshot.totalTrades, 1);
  assert.equal(snapshot.winningTrades, 0);
  assert.equal(snapshot.losingTrades, 1);
  assert.equal(snapshot.grossLossUsd, 10);
  assert.equal(snapshot.winRate, 0);

  await runtime.stop();
});

test("paper performance max drawdown updates correctly", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "open_win",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "close_win",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 110, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "open_loss",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 1, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_drawdown",
    causationId: "close_loss",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -1, price: 85, status: "FILLED" }
  });

  const snapshot = runtime.paperPerformanceSnapshot();
  assert.equal(snapshot.realizedPnlUsd, -5);
  assert.equal(snapshot.grossProfitUsd, 10);
  assert.equal(snapshot.grossLossUsd, 15);
  assert.equal(snapshot.maxDrawdownUsd, 15);
  assert.equal(runtime.healthSnapshot().paperMaxDrawdownUsd, 15);

  await runtime.stop();
});

test("paper performance snapshot is replay-safe", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_replay",
    causationId: "open",
    payload: { simulator: "paper_fill", side: "BUY", quantity: 2, price: 100, status: "FILLED" }
  });
  await runtime.ingest({
    source: "execution",
    symbol: "BTCUSDT",
    eventType: "ORDER_FILLED",
    correlationId: "corr_perf_replay",
    causationId: "close",
    payload: { simulator: "paper_fill", side: "SELL", quantity: -2, price: 105, status: "FILLED" }
  });

  assert.deepEqual(runtime.replayPersisted(), []);
  assert.deepEqual(runtime.paperPerformanceSnapshot(), PaperPerformanceTracker.replay(eventStore.events));

  await runtime.stop();
});

test("runtime refuses simulated order submission in HALTED", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const published: RuntimeEvent[] = [];
  runtime.events.onEvent((event) => {
    published.push(event);
  });
  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_halted",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  runtime.transitionMode("HALTED");
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "INTENT_CREATED",
      correlationId: "corr_halted",
      causationId: "signal_halted",
      payload: { side: "BUY", type: "MARKET", quantity: 1 }
    }),
    /runtime_shutdown/
  );

  assert.equal(runtime.state.mode(), "HALTED");
  assert.deepEqual(published.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(published.some((event) => event.eventType === "ORDER_SUBMITTED"), false);

  await runtime.stop();
});

test("stop is idempotent and ends in HALTED", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  await runtime.start();
  await runtime.stop();
  await runtime.stop();

  assert.equal(runtime.state.mode(), "HALTED");
  assert.equal(eventStore.closeCount, 1);
});

test("ingest after stop is rejected", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });

  await runtime.start();
  await runtime.stop();

  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_after_stop",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /runtime_shutdown/
  );
});

test("pending events are completed before shutdown finishes", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  let releaseHandler!: () => void;
  let handlerStarted!: () => void;
  const handlerStartedPromise = new Promise<void>((resolve) => {
    handlerStarted = resolve;
  });
  const releaseHandlerPromise = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });
  runtime.events.onEvent(async () => {
    handlerStarted();
    await releaseHandlerPromise;
  });

  await runtime.start();
  const ingestPromise = runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_pending_shutdown",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await handlerStartedPromise;

  let stopFinished = false;
  const stopPromise = runtime.stop().then(() => {
    stopFinished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(stopFinished, false);

  releaseHandler();
  await Promise.all([ingestPromise, stopPromise]);

  assert.equal(stopFinished, true);
  assert.equal(runtime.state.mode(), "HALTED");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(eventStore.closeCount, 1);
});

test("runtime rejects events that fail canonical RuntimeEvent validation", async () => {
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });
  await runtime.start();
  await assert.rejects(
    runtime.ingest({
      source: "test",
      symbol: "",
      eventType: "MARKET_TICK",
      correlationId: "corr_6",
      causationId: "test",
      payload: { bid: 100, ask: 101 }
    }),
    /Too small/
  );
  assert.equal(eventStore.events.length, 0);
  await runtime.stop();
});

test("persisted events can be replayed in order", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("audit logs replay success and failure", async () => {
  const successAudit = new MemoryAuditLog();
  const successStore = new MemoryEventStore();
  successStore.append(eventWithSeq(1));
  successStore.append(eventWithSeq(2));
  const successRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: successStore, audit: successAudit });

  assert.deepEqual(successRuntime.replayPersisted(), []);
  assert.equal(successAudit.entries("replay_started").length, 1);
  assert.equal(successAudit.entries("replay_completed").length, 1);
  await successRuntime.stop();

  const failureAudit = new MemoryAuditLog();
  const failureStore = new MemoryEventStore();
  failureStore.append(eventWithSeq(1));
  failureStore.append(eventWithSeq(1));
  const failureRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: failureStore, audit: failureAudit });

  assert.deepEqual(failureRuntime.replayPersisted(), [{ seq: 1, reason: "duplicate" }]);
  const failed = failureAudit.entries("replay_failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.seq, 1);
  assert.equal(failed[0]?.reason, "duplicate");
  await failureRuntime.stop();
});

test("duplicate seq fails replay", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), [{ seq: 2, reason: "duplicate" }]);

  await runtime.stop();
});

test("out-of-order seq fails replay", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(3));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), [{ seq: 2, reason: "out_of_order" }]);

  await runtime.stop();
});

test("replay cannot run from unsafe mode", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  runtime.transitionMode("SAFE_MODE");
  assert.throws(() => {
    runtime.replayPersisted();
  }, /invalid_runtime_transition:SAFE_MODE->REPLAY/);
  assert.equal(runtime.state.mode(), "HALTED");

  await runtime.stop();
});

test("replay duplicate bypass works only in replay mode", async () => {
  const normalStore = new MemoryEventStore();
  const normalRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: normalStore });
  await normalRuntime.start();
  await normalRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"));
  await assert.rejects(
    normalRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true }),
    /duplicate_seq:1/
  );
  await normalRuntime.stop();

  const replayStore = new MemoryEventStore();
  const replayRuntime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: replayStore });
  replayRuntime.transitionMode("REPLAY");
  await replayRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true });
  await replayRuntime.ingest(eventInputWithSeq(1, "evt_replay_bypass"), { bypassDuplicateChecks: true });

  assert.deepEqual(replayStore.events.map((event) => event.seq), [1, 1]);
  assert.deepEqual(replayStore.events.map((event) => event.eventId), ["evt_replay_bypass", "evt_replay_bypass"]);

  await replayRuntime.stop();
});

test("excessive processing latency triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, latencyHaltMs: 1, hotPathWarnMs: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });
  runtime.events.onEvent(async (event) => {
    if (event.eventType === "MARKET_TICK") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_latency_breach",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  const breaches = audit.entries("latency_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.eventType, "MARKET_TICK");
  assert.equal(breaches[0]?.reason, "processing_latency_halt");
  assert.equal(eventStore.events.at(-1)?.eventType, "SAFE_MODE");

  await runtime.stop();
});

test("queue overflow rejects ingest and enters SAFE_MODE", async () => {
  const config = { ...baseConfig, maxQueueDepth: 1 };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  let releaseHandler!: () => void;
  let handlerStarted!: () => void;
  const handlerStartedPromise = new Promise<void>((resolve) => {
    handlerStarted = resolve;
  });
  const releaseHandlerPromise = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });
  runtime.events.onEvent(async () => {
    handlerStarted();
    await releaseHandlerPromise;
  });

  await runtime.start();
  const firstIngest = runtime.ingest({
    seq: 1,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_queue_1",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await handlerStartedPromise;
  const secondIngest = runtime.ingest({
    seq: 2,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_queue_2",
    causationId: "test",
    payload: { bid: 102, ask: 103 }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await assert.rejects(
    runtime.ingest({
      seq: 3,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_queue_3",
      causationId: "test",
      payload: { bid: 104, ask: 105 }
    }),
    /queue_depth_exceeded:1/
  );
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.equal(audit.entries("backpressure_breach").length, 1);

  releaseHandler();
  await Promise.all([firstIngest, secondIngest]);
  await runtime.stop();
});

test("replay lag triggers SAFE_MODE", async () => {
  const config = { ...baseConfig, maxReplayLag: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  assert.deepEqual(runtime.replayPersisted(), []);
  assert.equal(runtime.state.mode(), "SAFE_MODE");
  const breaches = audit.entries("replay_lag_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.replayLag, 3);
  assert.equal(breaches[0]?.reason, "replay_lag_halt");

  await runtime.stop();
});

test("transient latency spike audits warning without SAFE_MODE", async () => {
  const config = { ...baseConfig, hotPathWarnMs: 1, latencyHaltMs: 100 };
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore: new MemoryEventStore(), audit });
  runtime.events.onEvent(async (event) => {
    if (event.eventType === "MARKET_TICK") {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_latency_warning",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  const warnings = audit.entries("latency_warning");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.reason, "transient_processing_latency");

  await runtime.stop();
});

test("runtime health metrics count processed and rejected events", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    seq: 1,
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_metrics_accepted",
    causationId: "test",
    payload: { bid: 100, ask: 101 }
  });
  await assert.rejects(
    runtime.ingest({
      seq: 1,
      source: "test",
      symbol: "BTCUSDT",
      eventType: "MARKET_TICK",
      correlationId: "corr_metrics_rejected",
      causationId: "test",
      payload: { bid: 102, ask: 103 }
    }),
    /duplicate_seq:1/
  );

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 1);
  assert.equal(health.eventsRejected, 1);
  assert.equal(health.queueDepth, 0);
  assert.equal(health.maxQueueDepthObserved, 0);
  assert.equal(health.mode, "NORMAL");
  assert.equal(health.running, true);

  await runtime.stop();
});

test("signal providers can register", async () => {
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore() });
  const firstProvider: SignalProvider = {
    id: "test_signal_provider_1",
    evaluate: () => []
  };
  const secondProvider: SignalProvider = {
    id: "test_signal_provider_2",
    evaluate: () => []
  };

  runtime.registerSignalProvider(firstProvider);
  runtime.registerSignalProvider(secondProvider);

  assert.deepEqual(runtime.signals.listProviders().map((provider) => provider.id), [
    "test_signal_provider_1",
    "test_signal_provider_2"
  ]);
  assert.throws(() => runtime.registerSignalProvider(firstProvider), /signal_provider_duplicate:test_signal_provider_1/);

  await runtime.stop();
});

test("spread widening provider generates canonical SIGNAL_CREATED", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider(new SpreadWideningSignalProvider(50));

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_spread_signal",
    causationId: "market",
    payload: { bidPrice: 100, askPrice: 102 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["BOOK_UPDATE", "SIGNAL_CREATED"]);
  const signal = eventStore.events[1];
  assert.equal(signal?.source, "runtime");
  assert.equal(signal?.symbol, "BTCUSDT");
  assert.equal(signal?.correlationId, "corr_spread_signal");
  assert.equal(signal?.causationId, "1");
  assert.equal(signal?.payload.providerId, "spread_widening_detector");
  assert.equal(signal?.payload.signalType, "SPREAD_WIDENING");
  assert.equal(audit.entries("event_accepted").length, 2);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 2);
  assert.equal(health.signalsGenerated, 1);
  assert.equal(health.signalsRejected, 0);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("invalid signal outputs are rejected without rejecting market event", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider({
    id: "invalid_signal_provider",
    evaluate: () => [
      {
        signalType: "INVALID_SIGNAL",
        symbol: "",
        payload: { reason: "test_invalid_symbol" }
      }
    ]
  });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_invalid_signal",
    causationId: "market",
    payload: { bid: 100, ask: 105 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK"]);
  assert.equal(audit.entries("event_rejected").length, 1);
  assert.equal(audit.entries("signal_rejected").length, 1);
  assert.match(audit.entries("signal_rejected")[0]?.reason ?? "", /Too small/);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 1);
  assert.equal(health.eventsRejected, 1);
  assert.equal(health.signalsGenerated, 0);
  assert.equal(health.signalsRejected, 1);

  await runtime.stop();
});

test("default SignalToIntentPolicy rejects signal conversion", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_default_signal_intent",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "runtime",
    symbol: "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_default_signal_intent",
    causationId: "1",
    payload: { providerId: "test", signalType: "SPREAD_WIDENING", confidence: 1 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SIGNAL_CREATED"]);
  assert.equal(audit.entries("signal_intent_rejected").length, 1);
  assert.equal(audit.entries("signal_intent_rejected")[0]?.reason, "signal_to_intent_disabled");
  assert.equal(eventStore.events.some((event) => event.eventType === "INTENT_CREATED"), false);

  await runtime.stop();
});

test("test SignalToIntentPolicy generates INTENT_CREATED and DRY_RUN ORDER_SUBMITTED", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalProvider(new SpreadWideningSignalProvider(50));
  runtime.registerSignalToIntentPolicy(testSignalToIntentPolicy);

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "BOOK_UPDATE",
    correlationId: "corr_test_signal_intent",
    causationId: "market",
    payload: { bidPrice: 100, askPrice: 102 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "BOOK_UPDATE",
    "SIGNAL_CREATED",
    "INTENT_CREATED",
    "ORDER_SUBMITTED"
  ]);
  assert.equal(eventStore.events[2]?.source, "runtime");
  assert.equal(eventStore.events[2]?.payload.policyId, "test_signal_to_intent_policy");
  assert.equal(eventStore.events[3]?.source, "execution");
  assert.equal(eventStore.events[3]?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("signal_intent_generated").length, 1);
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 4);
  assert.equal(health.signalsGenerated, 1);
  assert.deepEqual(runtime.replayPersisted(), []);

  await runtime.stop();
});

test("SAFE_MODE blocks signal-to-intent conversion", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });
  runtime.registerSignalToIntentPolicy(testSignalToIntentPolicy);

  await runtime.start();
  runtime.transitionMode("SAFE_MODE");
  await runtime.ingest({
    source: "runtime",
    symbol: "BTCUSDT",
    eventType: "SIGNAL_CREATED",
    correlationId: "corr_safe_signal_intent",
    causationId: "test",
    payload: { providerId: "test", signalType: "SPREAD_WIDENING", confidence: 1 }
  });

  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["SIGNAL_CREATED"]);
  assert.equal(eventStore.events.some((event) => event.eventType === "INTENT_CREATED"), false);
  assert.equal(eventStore.events.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  assert.equal(audit.entries("signal_intent_rejected").length, 1);
  assert.equal(audit.entries("signal_intent_rejected")[0]?.reason, "runtime_mode_disallows_signal_intent");

  await runtime.stop();
});

test("runtime health metrics count SAFE_MODE and websocket reconnects", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.handleMarketStreamLifecycle({
    action: "reconnecting",
    symbol: "BTCUSDT",
    stream: "bookTicker",
    reason: "websocket_disconnect"
  });
  await runtime.handleMarketStreamLifecycle({
    action: "disconnected",
    symbol: "BTCUSDT",
    stream: "bookTicker",
    reason: "websocket_disconnect"
  });

  const health = runtime.healthSnapshot();
  assert.equal(health.websocketReconnectCount, 1);
  assert.equal(health.safeModeCount, 1);
  assert.equal(health.mode, "SAFE_MODE");
  assert.equal(eventStore.events[0]?.eventType, "SAFE_MODE");

  await runtime.stop();
});

test("replay metrics track throughput", async () => {
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  eventStore.append(eventWithSeq(3));
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore });

  assert.deepEqual(runtime.replayPersisted(), []);

  const health = runtime.healthSnapshot();
  assert.equal(health.replayEventsProcessed, 3);
  assert.equal(health.replayThroughputEventsPerSecond > 0, true);

  await runtime.stop();
});

test("critical metric breaches are audited", async () => {
  const config = { ...baseConfig, maxReplayLag: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  eventStore.append(eventWithSeq(1));
  eventStore.append(eventWithSeq(2));
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });

  assert.deepEqual(runtime.replayPersisted(), []);

  const breaches = audit.entries("runtime_metric_breach");
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0]?.metric, "replay_lag");
  assert.equal(breaches[0]?.value, 2);
  assert.equal(breaches[0]?.threshold, 1);

  await runtime.stop();
});

test("runtime periodically audits health reports", async () => {
  const audit = new MemoryAuditLog();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore: new MemoryEventStore(), audit });

  await runtime.start();
  await new Promise((resolve) => setTimeout(resolve, 1_050));

  const reports = audit.entries("runtime_health_report");
  assert.equal(reports.length >= 1, true);
  assert.equal(typeof reports[0]?.metrics?.eventsProcessed, "number");
  assert.equal(reports[0]?.metrics?.mode, "NORMAL");

  await runtime.stop();
});

test("smoke: market tick to DRY_RUN order persists, audits, metrics, and replays", async () => {
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config: baseConfig, logger: createLogger(baseConfig), eventStore, audit });

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "MARKET_TICK",
    correlationId: "corr_smoke_success",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "BTCUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_smoke_success",
    causationId: "signal_smoke_success",
    payload: { side: "BUY", type: "MARKET", quantity: 1, topOfBookQuantity: 10 }
  });

  assert.equal(runtime.state.mode(), "NORMAL");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), [
    "MARKET_TICK",
    "INTENT_CREATED",
    "ORDER_SUBMITTED"
  ]);
  assert.equal(eventStore.events[2]?.source, "execution");
  assert.equal(eventStore.events[2]?.payload.status, "SUBMITTED");
  assert.equal(audit.entries("event_accepted").length, 3);
  assert.equal(audit.entries("dry_run_order_submitted_generated").length, 1);

  const healthBeforeReplay = runtime.healthSnapshot();
  assert.equal(healthBeforeReplay.eventsProcessed, 3);
  assert.equal(healthBeforeReplay.eventsRejected, 0);
  assert.equal(healthBeforeReplay.safeModeCount, 0);

  assert.deepEqual(runtime.replayPersisted(), []);
  const healthAfterReplay = runtime.healthSnapshot();
  assert.equal(healthAfterReplay.replayEventsProcessed, 3);
  assert.equal(healthAfterReplay.replayThroughputEventsPerSecond > 0, true);

  await runtime.stop();
});

test("smoke: stale market data enters SAFE_MODE without DRY_RUN order", async () => {
  const config = { ...baseConfig, staleDataHaltMs: 1 };
  const audit = new MemoryAuditLog();
  const eventStore = new MemoryEventStore();
  const runtime = new TradingRuntime({ config, logger: createLogger(config), eventStore, audit });
  const staleTimestamp = Date.now() - 10_000;

  await runtime.start();
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "MARKET_TICK",
    timestamp: staleTimestamp,
    receiveTimestamp: staleTimestamp,
    correlationId: "corr_smoke_failure",
    causationId: "market",
    payload: { bid: 100, ask: 101 }
  });
  await runtime.ingest({
    source: "test",
    symbol: "ETHUSDT",
    eventType: "INTENT_CREATED",
    correlationId: "corr_smoke_failure",
    causationId: "signal_smoke_failure",
    payload: { side: "BUY", type: "MARKET", quantity: 1 }
  });

  assert.equal(runtime.state.mode(), "SAFE_MODE");
  assert.deepEqual(eventStore.events.map((event) => event.eventType), ["MARKET_TICK", "SAFE_MODE"]);
  assert.equal(eventStore.events.some((event) => event.eventType === "ORDER_SUBMITTED"), false);
  assert.equal(eventStore.events[1]?.payload.reason, "stale_data_halt");
  assert.equal(audit.entries("safe_mode_entered").length, 1);
  assert.equal(audit.entries("safe_mode_entered")[0]?.reason, "stale_data_halt");

  const health = runtime.healthSnapshot();
  assert.equal(health.eventsProcessed, 2);
  assert.equal(health.eventsRejected, 0);
  assert.equal(health.safeModeCount, 1);

  await runtime.stop();
});
