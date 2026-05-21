# Failure Matrix

| Failure | Detection | Recommendation |
| --- | --- | --- |
| Stale feed | Edge health / latency | `SAFE_MODE` |
| Partial disconnect | Edge partition detector | `PASSIVE_ONLY` |
| Local transport partition | Edge partition detector | `HALT_INPUT` |
| Sequence gap | Edge health / trust | `SAFE_MODE` or `QUARANTINE_SOURCE` |
| Duplicate delivery spike | Edge health / trust | `THROTTLE` or `QUARANTINE_SOURCE` |
| Reconnect storm | Edge health | `PASSIVE_ONLY` |
| Feed divergence | Edge consensus | `SAFE_MODE` |
| Replay divergence evidence | Edge trust | `SAFE_MODE` or `QUARANTINE_SOURCE` |
| Live survivability snapshot missing | Live execution preflight | Reject order locally; no Binance order REST call |
| Live survivability snapshot stale | Live execution preflight TTL | Reject order locally; refresh snapshot outside execution path |
| Live survivability snapshot degraded | Exchange info / position risk preflight | Keep degraded, reject order locally, reconcile manually |
| Position exposure exceeds cap | Decimal-safe exposure snapshot | Reject order locally |
| Daily loss unavailable or over cap | Live execution daily loss state | Reject order locally |
| Exchange/local divergence | Survivability provider exchange confidence | `GOVERNANCE_HALT` |
| Ghost order | Governance trigger / reconciliation evidence | `GOVERNANCE_HALT` |
| Mutable replay history | Replay integrity check | `GOVERNANCE_HALT` |
| Missing duplicate or out-of-order sequence | Replay integrity check | `GOVERNANCE_HALT` |
| Binance 429 risk | Request governor token bucket or bounded queue | Queue or reject with auditable `retryAfterMs` |
| Startup truth divergence | Replay-vs-exchange reconciliation | Emit `startup_truth_reconciliation_failed`, enter `GOVERNANCE_HALT`, require manual review |
| Duplicate runtime process | PID/session lock | Reject startup; no second account mutator |
| WebSocket update ID gap | Sequence integrity guard | Quarantine stream after bounded resync attempts |
| Stale feed with weak exchange confidence | Survivability score across staleness, WS health, ack drift, sequence, reconciliation | Degrade, safe mode, or `HIBERNATION_MODE`; no halt on isolated latency alone |
| REST instability | Observable retry/circuit governor | Explicit retry decision; repeated instability enters `HIBERNATION_MODE` |
| Fatal auth state | HTTP 401/403 or invalid API key code | Fatal lifecycle event and `GOVERNANCE_HALT` |
| Poison websocket payload | Size and JSON-object validation | Reject payload and preserve partition evidence |
| Funding fee balance drift | Expected ledger delta category | Reconcile as expected ledger movement, not corruption |
| SQLite buffer full | Bounded event-store append buffer | Reject append with `sqlite_event_buffer_full`; runtime fails closed through persistence error handling |
| SQLite flush failure | Explicit non-hot-path flush | Audit `event_store_flush_failed`, halt risk, enter safe mode where possible |

Edge components do not mutate runtime state. Runtime governance and risk layers decide whether to apply recommendations.

Unsafe or corrupted input must fail closed through explicit reject/quarantine evidence. It must not be silently dropped.

Live Binance order submission must not perform hidden exchange reads for safety validation. Exchange filters and position risk are captured by an explicit survivability snapshot before submission; missing or stale snapshots are failure evidence, not fallback inputs.
