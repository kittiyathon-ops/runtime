# Runtime Journal

`src/runtime/runtime-journal.ts` provides append-only runtime journal mechanics.

Journal entries may represent:

- runtime events
- risk events
- execution intents
- state transitions
- replay markers
- governance transitions

Each entry has a monotonic `journalSeq`. Entries can reference a runtime event sequence or checkpoint id.

Journal validation detects:

- duplicate journal sequence numbers
- missing journal sequence numbers
- out-of-order journal sequence numbers

The journal is designed for audit, crash recovery, forensic reconstruction, and replay support. It does not perform destructive rewrites.

## Structured Alert Persistence

`RuntimeJournal.appendStructuredAlert(timestamp, alert)` stores structured alert payloads as journal entries with type `structured_alert`.

The journal stores the payload as data, not as formatted Telegram text. This preserves:

- severity
- tags
- correlation IDs
- replay-aware fields
- dashboard metadata derivation inputs
- audit and forensic replay compatibility

Telegram formatting remains an output/view layer only.

## Timeline Readiness

`src/runtime/runtime-timeline.ts` complements the journal with chronological alert-oriented entries for future dashboard feeds, replay visualization, forensic session viewers, and incident timelines.

The current implementation is in-memory and append-only. TODO: wire timeline persistence into the runtime journal once crash recovery and journal storage boundaries are finalized.

## Remaining Production Gaps

- Crash recovery and snapshot restore are not production-grade yet.
- Partial journal corruption handling and WAL repair are not implemented.
- Replicated journal and distributed replay are future phases.
- Structured alerts are persistable, but routing/dedup/aggregation are not yet wired into the main `TradingRuntime` delivery path.
