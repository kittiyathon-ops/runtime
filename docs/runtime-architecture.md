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
