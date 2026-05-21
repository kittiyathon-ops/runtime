# Operational Edge Cases V4.5.1

## Startup Truth Reconciliation

Live activation must compare fetched Binance account balances, open orders, and positions with replayed local state before execution is enabled. A mismatch emits `startup_truth_reconciliation_failed`, enters `GOVERNANCE_HALT`, and requires manual review. The runtime must not cancel, replace, or synthesize exchange state as an automatic repair.

Funding fees and other expected ledger movements must be represented as evidence-bound expected deltas. Expected funding drift is not corruption when the category and evidence reconcile the balance difference.

## Duplicate Runtime Prevention

`RuntimeSessionLock` provides a PID/session lock for deployment wrappers. A second runtime process must fail startup rather than risk double exposure or concurrent account mutation.

## WebSocket Integrity

`WebSocketSequenceIntegrity` validates update ID continuity. Duplicate packets are observable and idempotent; gaps require bounded resync; out-of-order packets or repeated gaps quarantine the stream.

## Degradation Behavior

Isolated latency does not halt the runtime. Stale-feed governance combines stale duration, websocket health, execution acknowledgement drift, sequence integrity, and reconciliation confidence into a survivability score. Decisions are `DEGRADE`, `SAFE_MODE`, `HIBERNATION_MODE`, or `GOVERNANCE_HALT`.

`HIBERNATION_MODE` suspends new execution but keeps bounded health monitoring and non-execution evidence flowing.

## REST Instability

`RestApiGovernor` converts explicit `RetryPolicy` decisions into observable operational actions. It does not sleep or retry internally. Repeated instability enters `HIBERNATION_MODE`. Fatal auth state, including HTTP 401, HTTP 403, or invalid API key code, is not retryable and enters `GOVERNANCE_HALT`.

## Poison Payload Defense

`ExchangePayloadGuard` enforces message size limits and strict JSON parsing. User stream messages must parse as JSON objects before they can normalize into execution reports.

## Replay Safety

All edge-case decisions are deterministic functions of explicit inputs and evidence IDs. Replay history remains append-only; reconciliation failures and degradation decisions are recorded as audit evidence rather than hidden local mutations.

## Persistence And Observability

SQLite event persistence is bounded and batched. `append` adds accepted events to an in-memory buffer, while explicit `flush` writes the batch in one transaction. Flush is called from non-execution control points: health reporting, replay reads, and shutdown.

Notification delivery is fire-and-observe. Alert send failures are recorded separately and do not block execution-critical paths. Metrics remain in-memory runtime state and degrade independently from exchange execution.

## Alpha Measurement

Alpha measurement is accounting-only. `StateManager` records requested price, executed price, executed quantity, fill drift, temporal latency, acknowledgement delay, MAE, and MFE from append-only runtime events.

MAE/MFE must be derived from observed mark prices, book midpoints, or execution-aware events. Candle highs/lows alone are not sufficient evidence because they may not represent reachable execution or mark-price state for the position.
