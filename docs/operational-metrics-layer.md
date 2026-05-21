# Operational Metrics Layer

## Purpose

The metrics layer exposes runtime and execution truth under PAPER, TESTNET, and LIVE conditions. It is passive observability only. It must not tune strategies, mutate governance, or influence order execution.

## Execution Metrics

`StateManager` tracks execution-aware measurements per order:

- MAE and MFE from mark prices, book midpoint, or execution-aware market ticks
- fill drift from requested price to executed price
- order submission to fill latency
- order submission to exchange acknowledgement delay
- signal creation to exchange acknowledgement latency when signal lineage is present
- intent creation to exchange acknowledgement latency when intent lineage is present
- order rejection reason and rejection timestamp

State is bounded by `maxTrackedOrders` and `maxEvidenceIdsPerOrder`.

## Runtime Health Metrics

`OperationalMetricsRecorder` records append-only bounded health facts:

- order rejection causes
- funding impact by symbol
- governance halt causes
- websocket reconnect frequency
- stale-feed frequency and retained stale duration
- sequence-gap count
- replay-divergence count

## Replay Safety

- Metrics collection is passive and does not mutate runtime decisions.
- Records are derived from canonical events or explicit operational metric inputs.
- No external IO, timers, network calls, retries, or async side effects occur in metric recording.
- Bounded retention drops oldest metric records while preserving monotonic metric sequence numbers and dropped-record counts.
- Financial values are stored as decimal strings and accumulated with `PrecisionMath`.
