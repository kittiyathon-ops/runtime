# Runtime Observability

Runtime observability is composed of metrics, audit records, persisted events, and operator alerts.

Telegram alerts are treated as an operator-facing journal rather than generic notifications. The runtime emits structured audit facts, the notification builder converts those facts into typed alert payloads, and Telegram formatters render compact mobile-first summaries.

Important operator alerts may be localized through `TELEGRAM_LANGUAGE`. Low-level technical identifiers such as replay divergence, sequence mismatch, latency spike, duplicate seq, and schema validation failure intentionally remain in English for debugging and searchability.

Formatter code lives in `src/notifications/` and remains independent from Telegram transport. Transport code lives in `src/alerts/telegram-notifier.ts` and only sends already formatted text.

## Alert Observability Pipeline

Structured alert payloads can now flow through:

```text
runtime/audit fact
-> structured alert payload
-> routing policy
-> deduplication
-> aggregation
-> timeline journal
-> Telegram formatter or future dashboard view
```

Routing is severity-aware. INFO alerts are dashboard-oriented by default, WARNING alerts route to Telegram, CRITICAL alerts are highlighted and journaled, and FATAL alerts carry escalation metadata.

Deduplication and aggregation use the `Clock` abstraction so repeated websocket reconnects, latency warnings, replay warnings, and persistence warnings can be handled deterministically without direct wall-clock calls.

## Runtime Timeline

`src/runtime/runtime-timeline.ts` provides append-only timeline entries for future replay UI, incident review, and session playback. Timeline entries preserve:

- deterministic timeline sequence
- timestamp
- runtime/event sequence when available
- severity
- type
- tags
- correlation IDs
- summary key
- structured payload reference
- runtime state when available
- dashboard metadata

The timeline does not mutate runtime state and does not persist formatted Telegram text.

## Remaining Production Gaps

These gaps remain intentionally visible:

- Portfolio Reconstruction: realized PnL, unrealized PnL, fee accounting, funding, liquidation tracking
- Persistence Recovery: crash recovery, snapshot recovery, partial corruption handling, WAL repair
- Runtime Consensus: state divergence repair, dual validation, shadow runtime compare
- Adaptive Risk: volatility regime, liquidity regime, latency regime, confidence scoring
- Distributed Runtime: distributed replay, replicated journal, multi-process isolation
