# Alerting

Telegram alerts are controlled by environment config:

- `TELEGRAM_ALERTS_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_LANGUAGE`
- `TELEGRAM_ALERT_MODE`

Supported `TELEGRAM_LANGUAGE` values:

- `th`
- `en`

Unknown or missing language values fall back to English. `.env.example` defaults to `TELEGRAM_LANGUAGE=th` for operator-facing alerts.

Supported `TELEGRAM_ALERT_MODE` values:

- `compact`
- `verbose`

Unknown or missing alert mode values fall back to `verbose`.

Translated operator alerts include:

- runtime start
- runtime stop
- SAFE_MODE
- order submitted
- order filled
- runtime error
- websocket disconnect/reconnect
- PnL update
- risk limit hit

Low-level technical identifiers intentionally remain in English for debugging and searchability, including terms such as sequence mismatch, latency spike, replay divergence, schema validation failure, replay lag, duplicate seq, and out-of-order event.

## Structured Alert Payloads

Alerts are structured payloads before they become Telegram text. Runtime code must not build raw Telegram strings directly.

Every alert payload includes:

- `kind`
- `severity`
- `primaryTag`
- optional `secondaryTags`
- optional `language`
- optional `mode`
- optional `correlation`

Correlation metadata is serializable and safe to persist in the runtime journal:

- `traceId`
- `eventId`
- `orderId`
- `sessionId`

## Severity

Supported severity levels:

- `INFO`: normal runtime, order, and PnL updates
- `WARNING`: reconnects, degradation, latency warning, operational recovery
- `CRITICAL`: SAFE_MODE, risk limit hit, replay divergence
- `FATAL`: HALT, KILL_SWITCH, unrecoverable runtime error

Severity is rendered at the top of Telegram messages and can later drive routing, dashboards, and incident review.

## Group Tags

Each alert has one primary group tag:

- `#RUNTIME`
- `#ORDER`
- `#RISK`
- `#REPLAY`
- `#WS`

Secondary tags are supported for search and review. Tags are derived from structured payload fields, not scattered string templates.

## Compact And Verbose Modes

Compact mode is mobile-first and short. It is intended for high-signal overnight monitoring.

Verbose mode includes audit details, runtime context, and correlation metadata. It is intended for incident review, replay inspection, and operator journals.

Correlation IDs are always preserved in the structured payload. Verbose mode renders all available IDs. Compact mode renders selected IDs for critical/fatal alerts.

## Emoji Semantics

Emoji usage is centralized in `src/notifications/emoji-map.ts`.

Semantic meanings include:

- profit/success
- loss/failure
- warning
- critical
- governance
- websocket
- long/short
- journal/audit
- replay
- halt/stop

Formatters consume semantic emoji mappings instead of duplicating inline emoji decisions.

## Replay-Aware Alerts

Replay alerts are structured and high severity by default. Supported replay alert kinds include:

- replay divergence
- missing sequence
- duplicate sequence
- out-of-order sequence

Replay alerts may include:

- `expectedSeq`
- `receivedSeq`
- `gap`
- `eventId`
- `replayCursor`
- correlation metadata

These alerts are designed for runtime journal replay, forensic reconstruction, and searchable incident review.

## Formatter Architecture

Telegram alerting is split into three layers:

1. Runtime emits structured audit/runtime events.
2. `src/notifications/telegram-alert-builder.ts` maps structured alert payloads to formatter functions.
3. `src/alerts/telegram-notifier.ts` sends already formatted text to Telegram.

Transport logic must not own alert wording. Runtime logic should not build multi-line Telegram strings directly.

Message catalogs live in `src/i18n/`. Mobile-first formatting helpers live in `src/notifications/`.

## Audit-Quality Alerts

The notification layer is also an operator journal. Formatters favor compact, scannable blocks that preserve review context:

- event outcome
- symbol and side
- quantities and prices
- PnL and PnL %
- daily win/loss summary
- runtime state
- correlation/order identifiers

Closed-position summaries are built with `formatPositionClosed(data)`. Optional fields such as RR, hold time, strategy reason, and runtime state are appended only when present so alerts stay compact.

## Alert Flow

```
runtime event
-> structured alert payload
-> Telegram formatter
-> Telegram notifier transport
```

This keeps Telegram formatting reusable for replay review, forensic timelines, daily reporting, and future operator dashboards.

## Routing Policy

Alert routing is severity-aware and based on structured payloads.

Default behavior:

- `INFO`: compact, dashboard-oriented, no Telegram by default
- `WARNING`: Telegram, dashboard, verbose unless the payload requests compact
- `CRITICAL`: Telegram, persistent journal, dashboard highlight, pin suggestion
- `FATAL`: Telegram, persistent journal, repeat/escalate metadata, halt escalation marker

Routing lives in `src/notifications/alert-routing-policy.ts` and `src/notifications/alert-router.ts`. It does not build raw strings and is intended to become configurable later.

## Deduplication

`src/notifications/alert-deduplicator.ts` prevents repeated structured alerts from spamming Telegram.

Fingerprints derive from structured payload fields:

- alert kind
- severity
- primary tag
- symbol when present
- source when present
- normalized reason/profile/value key

Deduplication uses the injected `Clock` abstraction, supports a TTL window, tracks suppressed counts, and fails closed on invalid options.

## Aggregation

`src/notifications/alert-aggregator.ts` collapses repeated alerts into structured `alert_aggregation` payloads.

Supported use cases include:

- websocket reconnect storms
- order reject spikes
- repeated latency warnings
- repeated replay warnings
- repeated persistence retry warnings

Aggregation preserves severity, tags, correlation metadata, fingerprint, count, window, and summary key. Telegram formatting remains a view layer.

## Dashboard Metadata

`src/notifications/alert-dashboard-metadata.ts` derives UI-agnostic dashboard metadata:

- severity color
- icon
- priority
- display mode
- pin suggestion
- highlight suggestion
- escalation suggestion

Severity colors:

- `INFO`: blue
- `WARNING`: yellow
- `CRITICAL`: orange
- `FATAL`: red

No dashboard UI is implemented in this phase.
