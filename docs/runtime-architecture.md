# Runtime Architecture

This document describes the current TradingRuntime architecture as implemented in `src/`.

## Runtime Flow

```text
TradingRuntime.start()
  -> validate/load RuntimeConfig
  -> create event bus, event store, audit sink, risk, execution, portfolio, replay
  -> audit runtime_started with active profile and resolved limits

External/runtime input
  -> TradingRuntime.ingest(...)
  -> canonical RuntimeEvent validation
  -> duplicate seq/eventId checks
  -> event publication through AsyncEventBus
  -> append to EventStore
  -> audit event_accepted
  -> portfolio/risk observation
  -> optional SAFE_MODE event generation
  -> optional DRY_RUN execution simulation for INTENT_CREATED
  -> checkpoint risk/seq snapshot

TradingRuntime.stop()
  -> close Binance market streams
  -> transition to STOPPING
  -> wait for active ingest to drain
  -> drain event bus
  -> close event store
  -> transition to HALTED
  -> audit runtime_stopped
```

The runtime is deterministic at the event boundary: all accepted inputs are normalized into `RuntimeEvent`, assigned or validated against sequence order, published, persisted, and audited.

## Module Responsibilities

`src/runtime/runtime.ts`
: Composes the runtime, owns ingest ordering, idempotency checks, lifecycle transitions, SAFE_MODE generation, checkpoints, replay entry, Binance market-data wiring, and DRY_RUN execution orchestration.

`src/core/event.ts`
: Defines canonical `RuntimeEvent`, accepted event types, event sources, validation, and `EventInput`.

`src/adapters/binance.ts`
: Owns Binance websocket market-data adapters for `bookTicker`, `trade`, and `markPrice`. It normalizes exchange payloads into canonical market `EventInput` and emits websocket lifecycle events. It does not submit orders.

`src/infra/event-bus.ts`
: Provides bounded async publication with sequence guard behavior for accepted runtime events.

`src/infra/event-store.ts` and `src/infra/sqlite-event-store.ts`
: Define and implement append/read persistence for replayable `RuntimeEvent` records.

`src/infra/config.ts`
: Loads runtime profile, resolved limits, Binance websocket URL, and infrastructure settings.

`src/audit/audit-log.ts`
: Records accepted events and runtime decisions, including lifecycle, rejection, SAFE_MODE, replay, and DRY_RUN audit entries.

`src/risk/risk-engine.ts`
: Tracks market freshness, order submit/reject rate, portfolio exposure, kill switch state, and risk halt reasons.

`src/execution/execution-engine.ts`
: Simulates order submission only. It generates `ORDER_SUBMITTED` events in DRY_RUN form when risk and runtime mode allow. It contains no live exchange order execution.

`src/portfolio/portfolio-state.ts`
: Applies fills and position updates and exposes exposure state used by risk checks.

`src/replay/replay-engine.ts`
: Verifies persisted event order for duplicate and out-of-order sequence mismatches.

`src/runtime/state-machine.ts`
: Defines allowed runtime mode transitions for `NORMAL`, `PAPER`, `REPLAY`, `SAFE_MODE`, `STOPPING`, and `HALTED`.

`src/runtime/replay-engine.ts`
: Provides the next-phase deterministic replay runtime with cursor/checkpoint state, pause/resume, replay speed modes, lag/watermark tracking, and integrity validation for missing, duplicate, and out-of-order sequence numbers.

`src/runtime/risk-governor.ts`
: Centralizes safety recommendations from exposure, leverage, drawdown, reject-rate, volatility, replay consistency, and persistence stability. It emits structured risk decisions but does not mutate runtime state.

`src/runtime/execution-kernel.ts`
: Enforces execution policy modes such as `ACTIVE`, `PASSIVE_ONLY`, `REDUCE_ONLY`, `SAFE_MODE`, and `HALT`. It validates/transforms intents and emits structured rejection events; it never submits orders.

`src/contracts/*`
: Defines canonical event contracts, explicit payload versions, schema compatibility checks, and registry lookup for replay-safe event interpretation.

`src/runtime/event-source.ts`
: Defines abstract replay/event sources so replay can read from SQLite, files, memory, live shadow streams, or future distributed sources without storage coupling.

`src/runtime/portfolio-state-engine.ts`
: Provides authoritative event-driven portfolio reconstruction from canonical events. Exchange adapters do not own portfolio state.

`src/runtime/runtime-journal.ts`
: Provides append-only runtime journal entries for events, transitions, replay markers, checkpoints, and forensic reconstruction.

`src/runtime/portfolio-reconstruction-engine.ts`
: Reconstructs authoritative portfolio snapshots from canonical events only. It detects duplicate fills, out-of-order fills, missing fills, and expected-state divergence.

`src/runtime/snapshot-manager.ts` and `src/runtime/recovery-manager.ts`
: Provide deterministic snapshot creation, validation, checkpoint metadata, and fail-closed recovery reports. Database repair is explicitly future work.

`src/runtime/runtime-consensus.ts`
: Provides single-node primary/shadow comparison scaffolding. It recommends SAFE_MODE or HALT but does not mutate runtime state.

`src/dashboard/*`
: Provides read-only serializable dashboard view models for timeline, alert stream, PnL, portfolio, runtime graph, replay, recovery, and consensus status.

`src/edge/*`
: Provides edge integrity analysis for normalized external input. It evaluates feed health, trust, latency, partitions, duplicate delivery, sequence gaps, and local feed consensus before runtime core consumption. Edge components recommend actions only and do not mutate runtime state.

`src/runtime/governance-state-machine.ts`
: Defines explicit governance states and transitions for survivability coordination across normal, degraded, safe, replay, shadow, and halted modes.

`src/i18n/*`
: Provides lightweight operator-facing alert message catalogs. Telegram alert transport stays separate from message text, and `TELEGRAM_LANGUAGE` selects Thai or English messages.

## Infra Layer

`src/infra/bounded-queue.ts`
: Protects the runtime from event bursts by bounding in-memory queue growth and making overflow explicit.

`src/infra/event-store.ts`
: Defines the persistence abstraction used by replayable runtime events.

`src/infra/sqlite-event-store.ts`
: Provides one concrete `EventStore` implementation backed by SQLite.

`src/infra/clock.ts`
: Provides deterministic time through a `Clock` interface. `SystemClock` is the only infra clock that reads wall time directly, while `ManualClock`/`ReplayClock` allow replay and tests to control time explicitly.

`src/infra/health-monitor.ts`
: Evaluates generic runtime health from queue depth, latency, websocket state, replay lag, memory pressure, reject rate, and persistence availability. It maps health to safety actions such as `SAFE_MODE`, `PASSIVE_ONLY`, `HALT`, and `KILL_SWITCH`.

`src/infra/metrics.ts`
: Provides lightweight counters, gauges, and histograms with deterministic snapshots that can feed health evaluation and tests.

`src/infra/idempotency-cache.ts`
: Provides a bounded, TTL-based key cache for duplicate prevention. It depends on injected `Clock` rather than `Date.now()`, which keeps replay behavior deterministic.

`src/infra/retry-policy.ts`
: Provides bounded retry decisions, fixed/exponential backoff, retry budgets, and circuit breaker state. Unsafe order submission retries require an idempotency key; persistence and network reconnect retries can be bounded by policy.

## Event Lifecycle

```text
EventInput
  -> RuntimeEventSchema.parse(...)
  -> seq defaults to runtime seq + 1 if absent
  -> timestamp/processingTimestamp default to Date.now() if absent
  -> duplicate seq/eventId rejection unless replay bypass is allowed
  -> AsyncEventBus.publish(...)
  -> EventStore.append(...)
  -> mark seq/eventId accepted
  -> audit event_accepted
  -> portfolio/risk/reconciliation handling
  -> checkpoint
```

Accepted market-data event sources include `binance_market_ws` and `test`. Binance exchange payloads enter through:

```text
Binance websocket message
  -> normalizeBinanceMarketPayload(...)
  -> EventInput source: binance_market_ws
  -> eventType: BOOK_UPDATE or MARKET_TICK
  -> TradingRuntime.ingestExternalMarketEvent(...)
  -> TradingRuntime.ingest(...)
```

Replay-safe handling is based on canonical event validation plus idempotency. Binance-normalized events include deterministic exchange-derived `eventId` values such as stream, symbol, and exchange update/trade/event identifiers.

## Replay Lifecycle

```text
TradingRuntime.replayPersisted(fromSeq, limit)
  -> audit replay_started
  -> transition to REPLAY if not already in REPLAY
  -> EventStore.readFrom(fromSeq, limit)
  -> check replay lag against maxReplayLag
  -> ReplayEngine.verify(events)
       -> duplicate seq mismatch
       -> out_of_order seq mismatch
  -> audit replay_completed or replay_failed
  -> restore previous mode when still in REPLAY
```

Replay duplicate bypass is only honored while the runtime mode is `REPLAY`. Normal runtime ingestion still rejects duplicate sequence numbers and duplicate event IDs.

## Canonical Event Model

Runtime contracts live in `src/contracts/`. Event versions are explicit and registry lookup validates payloads by event type and version. Exchange adapters normalize external payloads into canonical event contracts before runtime core sees them.

Schema evolution is compatibility-checked. Current support is conservative: same-version and forward runtime upgrades are compatible; downgrades are rejected.

## Portfolio Authority Model

The portfolio state engine is the authoritative replay-safe state projection. It mutates only from canonical events such as `ORDER_FILLED` and `POSITION_UPDATED`.

Adapters never own authoritative portfolio state. Runtime reconstruction can replay the same events through `PortfolioStateEngine.reconstruct(...)` and produce the same snapshot.

## Runtime Journal Semantics

The runtime journal is append-only. Entries have monotonically increasing journal sequence numbers and can reference runtime event sequences or checkpoints.

Journal validation detects missing, duplicate, and out-of-order journal entries. The journal is intended for crash recovery, audit, governance transition tracing, and forensic replay.

## SAFE_MODE Triggers

The runtime enters `SAFE_MODE` on fail-closed conditions:

- Risk rejects an `INTENT_CREATED` event, including stale market data before intent evaluation.
- Runtime is already in `SAFE_MODE` and order creation is attempted.
- Portfolio reconciliation detects a position mismatch.
- Risk observation halts on reject-rate or max-exposure breach.
- Processing latency exceeds `latencyHaltMs`.
- Event queue depth reaches `maxQueueDepth`.
- Replay lag exceeds `maxReplayLag`.
- Binance websocket lifecycle reports `disconnected`.
- Binance websocket lifecycle reports `stale_stream_detected`.
- Binance exchange payload normalization detects malformed data.

SAFE_MODE handling persists and audits a canonical `SAFE_MODE` event when there is a causation event or market-stream failure event path. Runtime-only breaches that occur before a valid event can be persisted still audit `safe_mode_entered`.

## Runtime Profiles

Profiles are resolved in `src/infra/config.ts`:

```text
DEVELOPMENT
  General local defaults with moderate limits.

PAPER
  Stricter latency, stale-data, reject-rate, exposure, and drawdown limits.

REPLAY
  Higher replay/event capacities and relaxed replay/offline limits.

SAFE
  Small queue capacity and strict latency/stale-data/risk thresholds.
```

The active profile is audited at startup with resolved numeric limits:

- `eventQueueCapacity`
- `maxQueueDepth`
- `maxReplayLag`
- `hotPathWarnMs`
- `staleDataHaltMs`
- `latencyHaltMs`
- `maxRejectRate`
- `maxExposureUsd`
- `maxDrawdownUsd`
- `idempotencyCacheSize`

## Websocket Recovery Flow

```text
TradingRuntime.connectBinanceMarketData(symbol)
  -> create BinanceMarketStream
  -> subscribe bookTicker
  -> subscribe trade
  -> subscribe markPrice

websocket open
  -> lifecycle: connected
  -> audit market_stream_connected

websocket message
  -> parse JSON
  -> normalize exchange payload
  -> ingest external market event

websocket close while not intentionally closed
  -> lifecycle: disconnected
  -> audit market_stream_disconnected
  -> risk halt: websocket_disconnect
  -> persist/audit SAFE_MODE event
  -> lifecycle: reconnecting
  -> audit market_stream_reconnecting

stale heartbeat interval
  -> lifecycle: stale_stream_detected
  -> audit market_stream_stale_stream_detected
  -> risk halt: stale_market_stream
  -> persist/audit SAFE_MODE event

malformed message
  -> lifecycle: stale_stream_detected with malformed reason
  -> risk halt: malformed_exchange_payload
  -> persist/audit SAFE_MODE event
```

Current reconnect handling audits `reconnecting` and fails closed into `SAFE_MODE`. It does not resume trading automatically and it does not add live order execution.

## Adapter Boundary Design

Exchange adapters live outside runtime core. The Binance adapter scaffold under `src/adapters/binance/` separates:

- websocket lifecycle and idempotent delivery
- REST boundary stubs
- exchange payload normalization
- adapter orchestration

Adapters emit canonical `EventInput` and hide exchange-specific payload shape from runtime internals.

## Deterministic Replay Guarantees

Replay is sequence-first. The replay engine preserves original event order, tracks cursor/checkpoints, and validates:

- missing sequence numbers
- duplicate sequence numbers
- out-of-order events

Replay speed can be realtime, accelerated, or step-based, and all timing depends on injected `Clock`.

## Risk Governance Flow

The risk governor is advisory:

```text
runtime observations
  -> RiskGovernor.evaluate(...)
  -> structured recommendation
  -> optional RISK_ALERT events
  -> runtime decides whether/how to transition
```

Recommendations include `OK`, `REDUCE_ONLY`, `PASSIVE_ONLY`, `SAFE_MODE`, `HALT`, and `KILL_SWITCH`.

## Execution Kernel Role

The execution kernel validates intents against runtime policy before any adapter submission layer exists:

```text
intent
  -> structural validation
  -> mode policy checks
  -> reduce-only/passive-only enforcement
  -> optional adaptive sizing
  -> accepted transformed intent or ORDER_REJECTED-compatible failures
```

It does not own exchange connectivity and cannot place real orders.

## Persistence Flow

```text
publishAccepted(event)
  -> optional idempotency assertion
  -> AsyncEventBus.publish(event)
  -> EventStore.append(event)
  -> update runtime seq and seen id caches
  -> audit event_accepted
```

The default event store is `SqliteEventStore`, which stores each event as canonical JSON keyed by sequence. Tests use an in-memory `EventStore` implementation with the same append/read contract.

Persistence compatibility is preserved by keeping all accepted data as `RuntimeEvent` records and replaying from `EventStore.readFrom(...)`.

## DRY_RUN Execution Flow

```text
INTENT_CREATED
  -> validate canonical RuntimeEvent
  -> idempotency checks
  -> RiskEngine.evaluateIntent(...)
  -> reject into SAFE_MODE if risk disallows
  -> skip execution if runtime mode cannot submit orders
  -> publish/persist/audit INTENT_CREATED
  -> RiskEngine.observe(...)
  -> ExecutionEngine.simulate(...)
       -> only in modes that can submit orders
       -> generate ORDER_SUBMITTED with payload.status = SUBMITTED
       -> source = execution
       -> no network call
       -> no live Binance order
  -> publish/persist/audit generated ORDER_SUBMITTED
  -> audit dry_run_order_submitted_generated
```

Execution remains DRY_RUN only. Binance integration is market-data ingestion only.
