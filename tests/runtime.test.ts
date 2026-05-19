import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { TradingRuntime } from "../src/runtime/runtime.js";
import { ConfigSchema, RUNTIME_PROFILE_LIMITS, type RuntimeConfig, type RuntimeProfile } from "../src/infra/config.js";
import { createLogger } from "../src/infra/logger.js";
import { RuntimeEventSchema, type EventInput, type RuntimeEvent } from "../src/core/event.js";
import type { AuditEntry, AuditRecord } from "../src/audit/audit-log.js";
import { ExecutionEngine } from "../src/execution/execution-engine.js";
import { PortfolioState } from "../src/portfolio/portfolio-state.js";
import { RiskEngine } from "../src/risk/risk-engine.js";

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
