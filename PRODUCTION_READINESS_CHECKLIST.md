# Production Readiness Checklist

This checklist is the production gate for the autonomous trading runtime. It is intentionally strict. A feature is not considered production-ready because it exists in documentation; it must be implemented in code, covered by tests, and produce audit/evidence that can be used during incident reconstruction.

Status labels:

- `PASS` - implemented and covered by tests/evidence.
- `PARTIAL` - implemented in part, but missing coverage, persistence, live drill, or operational proof.
- `GAP` - not implemented yet.

## Current Verdict

Current classification: `ADVANCED SCAFFOLD / PRE-PRODUCTION`

The runtime has strong foundations: deterministic replay, authority hierarchy, causal buffering, config fingerprints, idempotency, operator override ledger, process survivability monitoring, and edge accounting. It is not yet fully production-ready under this checklist because several required live drills, dependency health scoring, novelty detection, recovery states, and operational runbooks still need implementation or stronger proof.

## 1. Truth And Authority

Status: `PARTIAL`

Implemented:

- Authority hierarchy exists in `src/arbitration/exchange-state-authority.ts`.
- `resolveConflict(...)` chooses higher authority and emits `CONFIDENCE_DOWNGRADE`.
- Equal-authority unresolvable conflicts can require halt.
- Runtime integrates authority conflict checks for Binance user-stream events.

Evidence:

- Tests in `tests/runtime.test.ts` cover downgrade and halt-required conflict paths.

Remaining gaps:

- Every state fact does not yet carry a complete `{ confidence, sources, expiry }` envelope.
- `SOURCE_CONFLICT` is not emitted as a separate event name; current implementation uses `CONFIDENCE_DOWNGRADE` and `exchange_state_conflict_resolved`.
- Periodic REST `/account` and `/order/:id` reconciliation loops are not fully implemented as continuous runtime authority checks.

Required next work:

- Add a canonical `StateFact<T>` envelope with confidence, sources, expiry, and evidence IDs.
- Emit explicit `SOURCE_CONFLICT` for every source disagreement.
- Add recurring REST authority reconciliation loop.

## 2. Replay Integrity

Status: `PASS / PARTIAL`

Implemented:

- Replay exists and validates persisted events.
- Replay uses deterministic event ordering.
- Duplicate sequence and out-of-order replay failures are tested.
- Config fingerprint is validated before replay.

Evidence:

- `src/replay/replay-engine.ts`
- `src/runtime/replay-engine.ts`
- `src/runtime/runtime.ts`
- Tests for duplicate seq, out-of-order seq, replay failure, replay success.

Remaining gaps:

- Bit-for-bit full runtime state equality is not enforced for every subsystem.
- Golden replay fixture should be promoted to an explicit production artifact.
- Sequence gap tests exist in edge/websocket components, but a full end-to-end persisted replay gap drill should be added.

Required next work:

- Add golden replay files under `tests/fixtures/replay/`.
- Add full state snapshot equality checks after replay.
- Add end-to-end missing event and sequence gap replay drills.

## 3. Recovery Correctness

Status: `PARTIAL`

Implemented:

- Snapshot manager exists.
- Recovery manager replays from checkpoint.
- Corrupt snapshot tests exist.
- Runtime has restart sequence restoration from persisted events.
- Process survivability includes restart re-verification hook.

Evidence:

- `src/runtime/recovery-manager.ts`
- `src/runtime/snapshot-manager.ts`
- `src/runtime/process-survivability.ts`

Remaining gaps:

- No explicit `RECOVERY` and `VERIFIED_RECOVERY` runtime states.
- `HALTED -> RUNNING` is already blocked, but the required recovery path is not represented by named runtime states.
- Crash-before-persist and crash-after-submit drills need first-class tests.
- Torn write and partial corruption handling exists around snapshot corruption but not as a full event-store corruption drill.

Required next work:

- Add `RECOVERY` and `VERIFIED_RECOVERY` states.
- Require `HALTED -> RECOVERY -> VERIFIED_RECOVERY -> NORMAL/PAPER` path.
- Add crash-before-persist and crash-after-submit tests.
- Add event-store torn-write simulation.

## 4. Causal Ordering

Status: `PASS / PARTIAL`

Implemented:

- Reorder buffer exists in `src/temporal/causal-reorder-buffer.ts`.
- Configurable `maxReorderWindowMs`.
- Clock skew alert exists.
- Causal uncertainty emits downgrade.
- Runtime enriches exchange payloads with exchange/receive/sequence fields.

Evidence:

- Tests cover clock skew and causal uncertainty.

Remaining gaps:

- Need fuller tests for network jitter, delayed fill, duplicated update, and clock drift at runtime integration level.
- Arrival order is no longer the intended truth, but more adversarial tests should prove this with mixed fills/order updates.

Required next work:

- Add end-to-end jitter and delayed-fill tests.
- Add duplicated update integration test through runtime ingest.
- Add clock drift chaos scenario.

## 5. Idempotency

Status: `PARTIAL`

Implemented:

- Runtime injects deterministic idempotency keys for intent/order state mutation.
- Live execution requires idempotency key and rejects duplicate client order IDs.
- Duplicate sequence and duplicate event IDs are rejected.
- Replay duplicate bypass is limited to replay mode.

Evidence:

- `src/runtime/runtime.ts`
- `src/live-execution/binance-live-execution.ts`
- `src/infra/idempotency-cache.ts`

Remaining gaps:

- Stored-result return behavior for duplicate submissions is not fully implemented; duplicates generally reject cleanly.
- Idempotency state survives restart through persisted events for known order IDs, but not through a dedicated durable idempotency ledger.
- Retry storm tests exist in lower-level retry/circuit breaker components, but need full order-submission storm tests.

Required next work:

- Add durable idempotency ledger.
- Store and return previous result for duplicate submissions where appropriate.
- Add retry storm order-submission integration test.

## 6. Evidence And Audit

Status: `PARTIAL`

Implemented:

- Audit records decisions, accepted events, rejected events, safe mode, conflicts, and edge reports.
- Tamper-evident hash-chained evidence log exists.
- Config fingerprint is captured at startup.

Evidence:

- `src/audit/audit-log.ts`
- `src/audit/tamper-evident-evidence-log.ts`
- `src/runtime/runtime.ts`

Remaining gaps:

- Tamper-evident log is currently in-memory, not durable.
- Not every audit decision is persisted through hash-chained evidence.
- Evidence bundle does not yet uniformly include config fingerprint, runtime state, and operator actions for every state-affecting action.

Required next work:

- Persist tamper-evident log to SQLite or append-only file.
- Route all state-affecting audit entries through hash-chained evidence.
- Add tamper simulation test that modifies stored evidence and verifies detection.

## 7. Operator Discipline

Status: `PARTIAL`

Implemented:

- Operator override ledger exists.
- Override requires reason, operator ID, timestamp, evidence.
- High severity requires dual authorization.
- Quota per 24h is enforced.
- Ledger entries are append-only and immutable.

Evidence:

- `src/oversight/operator-override-ledger.ts`

Remaining gaps:

- No explicit pending-review state after every override.
- Incident drill schedule is not implemented as code.
- Override ledger is in-memory, not durable.

Required next work:

- Add `PENDING_REVIEW` override lifecycle state.
- Add incident drill scheduler and evidence output.
- Persist override ledger.

## 8. Process Survivability

Status: `PARTIAL`

Implemented:

- Process survivability monitor tracks heap utilization, GC pause ratio, async queue depth, CPU overhead, memory overhead, and restart cadence.
- Restart re-verification hook exists.
- Runtime audits process survivability during health reports.

Evidence:

- `src/runtime/process-survivability.ts`
- `src/runtime/runtime.ts`

Remaining gaps:

- Real GC pause collection through Node performance hooks is not wired.
- Uptime and restart reason should be explicitly captured in runtime health.
- Stale closure / dangling async detection is not implemented.
- Long-lived Node burn-in exists in other modules, but this specific process survivability monitor needs a long-duration burn-in scenario.
- Heap pressure currently produces process survivability decision, but does not map to a named `DEGRADED` runtime state.

Required next work:

- Add Node performance observer for GC pause.
- Add uptime and restart reason fields.
- Add dangling async detector.
- Add process survivability burn-in test.
- Add explicit degraded state or map high heap pressure to `SAFE_MODE`/`HIBERNATION_MODE`.

## 9. Economic Viability

Status: `PASS / PARTIAL`

Implemented:

- Edge attribution report exists.
- Runtime Edge and Market Edge are separated in code and dashboard section.
- Costs include survivability, reconciliation, governance, operational, and infrastructure complexity.
- Survivability ratio threshold is enforced.
- Subsystem ROI threshold is enforced.
- Minimum net edge threshold is enforced.
- Seven consecutive non-positive edge days are detected.
- Runtime can enter `ECONOMICALLY_UNVIABLE`.

Evidence:

- `src/economy/edge-attribution.ts`
- `src/dashboard/dashboard-runtime-view.ts`
- `src/runtime/runtime.ts`

Remaining gaps:

- Daily report generation is implemented as a ledger API, but not scheduled automatically by runtime timer.
- Real measurement inputs for cost and overhead need production instrumentation.
- Per-subsystem ROI evidence needs persistent storage.

Required next work:

- Add daily scheduler for edge reports.
- Add real measurement collectors for overhead and cost attribution.
- Persist edge reports and ROI evidence.

## 10. Live Exchange Safety

Status: `PARTIAL`

Implemented:

- Live execution requires fresh survivability snapshot.
- Live safety gates validate profile, dry run, kill switch, endpoint, credentials, symbol, idempotency, daily loss, order caps, exposure caps, and one-position rule.
- Position mismatch can trigger safe mode.
- Kill switch works before REST order.

Evidence:

- `src/live-execution/binance-live-execution.ts`
- `src/runtime/runtime.ts`

Remaining gaps:

- Continuous REST `/account` and `/order/:id` reconciliation with local state is not fully implemented.
- Need stronger live shadow mode proof over time.

Required next work:

- Add scheduled REST reconciliation loop.
- Add order-finality reconciliation against `/order/:id`.
- Add long-running live shadow mode report.

## 11. Dependency Health

Status: `PARTIAL`

Implemented:

- Edge health and latency modules exist.
- REST governor and WebSocket sequence integrity exist.
- Market stream lifecycle can trigger safe mode.

Evidence:

- `src/edge/`
- `src/bridge/RestApiGovernor.ts`
- `src/bridge/WebSocketSequenceIntegrity.ts`

Remaining gaps:

- Dependency health is not yet unified into a single score for WS, REST, clock, DNS.
- Health is not re-evaluated on every interaction across all dependencies.
- DNS health is not modeled.

Required next work:

- Add dependency health score model.
- Integrate WS, REST, clock, DNS into one dependency health ledger.
- Halt dependent subsystems below critical score.

## 12. Unknown Unknown Handling

Status: `PARTIAL / GAP`

Implemented:

- Payload trust scoring catches malformed or missing critical fields.
- Unknown truth can trigger safe mode.
- Existing immune/anomaly modules exist in repo.

Evidence:

- `src/bridge/PayloadTrustScoring.ts`
- `src/runtime/truth-confidence.ts`
- `src/immune/`
- `src/adaptive-immune/`

Remaining gaps:

- No canonical novelty detection for unseen exchange event patterns.
- No runtime behavior baseline for order latency, fill rate, WS cadence, REST latency.
- Behavior drift tests are not fully wired into runtime operation.

Required next work:

- Add event-pattern novelty detector.
- Add baseline model for latency/fill/WS/REST behavior.
- Escalate novelty and drift through audit and dashboard.

## 13. Production Test Matrix

Status: `PARTIAL`

Already covered in some form:

- duplicate event
- out-of-order event
- sequence gap in WebSocket sequence integrity
- duplicate fill
- stale snapshot
- exchange/local mismatch
- operator override abuse
- config drift
- clock skew
- restart recovery hook
- evidence hash-chain verification

Needs stronger first-class production drills:

- golden replay fixture
- chaos reconnect storm
- partial fill flood
- crash-before-persist
- crash-after-submit
- GC pause under load
- evidence tamper simulation against durable storage

Required next work:

- Create `tests/production-matrix.test.ts`.
- Add fixture-backed drill suite with explicit pass/fail readiness output.

## 14. Operational Readiness

Status: `PARTIAL`

Implemented:

- Dashboard models exist.
- Edge Attribution is exposed as a primary dashboard section.
- Incident and dashboard modules exist.

Evidence:

- `src/dashboard/`
- `src/operator-dashboard/`
- `src/incidents/`

Remaining gaps:

- Runbooks for `HALT`, `SAFE_MODE`, `RECOVERY`, and `VERIFIED_RECOVERY` need to be formalized.
- One-screen view for truth, confidence, exposure, and health is not yet fully composed.
- Operator-facing reason strings exist in audit, but dashboard decision support needs stronger UX-level modeling.

Required next work:

- Add `docs/runbooks/`.
- Add one-screen operational status view model.
- Add incident reconstruction command or report generator.

## 15. Go / No-Go Rule

Status: `GAP AS AUTOMATED GATE`

Current required go/no-go domains:

- replay
- recovery
- reconciliation
- override governance
- survivability
- economic viability
- evidence audit
- chaos drills
- live shadow mode

Remaining gap:

- These are not yet composed into one automated go/no-go command.

Required next work:

- Add `pnpm readiness:production`.
- The command should fail unless all readiness domains emit `PASS`.
- Generate a signed/tamper-evident readiness report.

## Summary

The runtime is beyond a basic scaffold and has many production-grade mechanisms implemented. Under this stricter checklist, it should still be treated as pre-production until the remaining live drills, durable evidence persistence, recovery state path, dependency health scoring, novelty detection, and automated go/no-go gate are completed.

The correct engineering stance is:

> Advanced autonomous runtime scaffold with several production-grade safety mechanisms implemented, but not yet fully production-certified.

