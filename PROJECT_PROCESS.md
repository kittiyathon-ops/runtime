# Production-Grade Autonomous Trading Runtime: Project Process

This repository implements a TypeScript/Node.js autonomous trading runtime for cryptocurrency exchange execution. The runtime is designed around deterministic state, exchange truth reconciliation, strict safety gates, replayability, operator discipline, and economic accountability.

The goal is not only to place orders. The goal is to keep the runtime honest about what it knows, what it does not know, what it costs to operate, and whether it still deserves to trade.

## Current Status

The runtime currently implements the full safety process from Parts 1-9 plus Edge Accounting:

- Exchange authority hierarchy and conflict resolution
- Causal event ordering and clock skew detection
- Explicit runtime state machine
- Immutable config fingerprinting
- Operator override discipline
- Truth confidence governance
- Payload trust scoring
- Idempotency enforcement
- Process survivability monitoring
- Edge accounting and economic viability gates

Verification at the time of writing:

- `pnpm typecheck` passes
- `pnpm test` passes with 556 tests

## Repository Shape

Important directories:

- `src/runtime/` - main runtime, state machine, replay, journals, process survivability
- `src/arbitration/` - exchange authority and conflict resolution
- `src/temporal/` - causal ordering, replay time semantics, temporal validation
- `src/adapters/binance/` - Binance REST/WebSocket normalization and live execution bridge
- `src/live-execution/` - live order safety gates and user stream execution reports
- `src/risk/` - risk engine and runtime halting decisions
- `src/execution/` - order simulation and execution planning
- `src/portfolio/` - portfolio state application
- `src/bridge/` - payload guards, request governance, payload trust scoring
- `src/oversight/` - operator actions and override ledger
- `src/economy/` - edge accounting and economic viability rules
- `src/dashboard/` - dashboard view models, including Edge Attribution
- `src/audit/` - audit and tamper-evident evidence logging
- `tests/runtime.test.ts` - main integration and unit coverage

## Runtime Flow Step By Step

### 1. Startup

The runtime starts by loading and validating configuration through `ConfigSchema`.

Key startup outputs:

- Runtime profile such as `DEVELOPMENT`, `PAPER`, `LIVE`, `REPLAY`, or `SAFE`
- Limits such as queue depth, latency threshold, replay lag, reorder window, and clock skew threshold
- A deterministic immutable config fingerprint

The config fingerprint is captured at startup and emitted into audit evidence. Replay and ingest paths validate that the active config still matches the startup fingerprint. Any mutation triggers `CONFIG_DRIFT_DETECTED`.

Relevant files:

- `src/infra/config.ts`
- `src/runtime/config-fingerprint.ts`
- `src/runtime/runtime.ts`

### 2. Event Ingestion

All runtime behavior enters through canonical events. Events are validated using the runtime event schema.

Every exchange event must carry:

- `exchangeTimestamp`
- `receiveTimestamp`
- causal sequence data when available
- payload-level `exchange_time`
- payload-level `received_time`
- payload-level `sequence_id`

Inbound exchange payloads are assessed before being trusted. Unsafe payloads are either accepted, quarantined, or rejected.

Relevant files:

- `src/core/event.ts`
- `src/bridge/PayloadTrustScoring.ts`
- `src/runtime/runtime.ts`

### 3. Payload Trust Scoring

Every inbound payload receives a `PayloadTrustAssessment`:

```ts
interface PayloadTrustAssessment {
  trustScore: number;
  flags: string[];
  acceptanceDecision: "ACCEPT" | "QUARANTINE" | "REJECT";
}
```

Trust scoring checks for missing exchange time, missing received time, missing event ID, missing sequence ID, and invalid numeric payloads.

Governance behavior:

- `ACCEPT` continues normally
- `QUARANTINE` downgrades confidence and marks truth as disputed
- `REJECT` downgrades confidence and can trigger safe mode for unknown state

Relevant file:

- `src/bridge/PayloadTrustScoring.ts`

### 4. Causal Ordering

The runtime does not process exchange events purely by arrival order. It uses causal ordering based on:

- exchange timestamp
- exchange sequence ID when available
- configured reorder window

If ordering cannot be established, the runtime emits:

- `CAUSAL_UNCERTAINTY`
- `CONFIDENCE_DOWNGRADE`

Clock drift beyond threshold emits:

- `CLOCK_SKEW_ALERT`

Relevant files:

- `src/temporal/causal-reorder-buffer.ts`
- `src/runtime/runtime.ts`

### 5. Exchange State Authority

Exchange truth is ranked by authority. Higher authority always wins over lower authority.

Authority hierarchy:

1. REST account balance snapshot
2. REST order state
3. WebSocket fill events
4. WebSocket order update stream
5. Local runtime memory

When lower authority conflicts with higher authority, the lower authority cannot silently override. The runtime emits `CONFIDENCE_DOWNGRADE`.

If conflict is unresolvable, the runtime enters a halt path.

Relevant file:

- `src/arbitration/exchange-state-authority.ts`

### 6. Runtime State Machine

The runtime has explicit states and no undeclared transitions.

Important states:

- `NORMAL`
- `PAPER`
- `REPLAY`
- `SAFE_MODE`
- `HIBERNATION_MODE`
- `GOVERNANCE_HALT`
- `ECONOMICALLY_UNVIABLE`
- `STOPPING`
- `HALTED`

Every transition defines:

- authorization level
- invariants before transition
- invariants after transition
- required evidence

Forbidden direct recovery paths are enforced. For example, `ECONOMICALLY_UNVIABLE -> NORMAL` is illegal.

Relevant file:

- `src/runtime/state-machine.ts`

### 7. Truth Confidence Model

The runtime tracks confidence in operational truth.

Truth states:

- `HIGH_CONFIDENCE`
- `DEGRADED_CONFIDENCE`
- `DISPUTED_TRUTH`
- `UNKNOWN_STATE`

Governance behavior:

- `HIGH_CONFIDENCE` allows normal operation
- `DEGRADED_CONFIDENCE` reduces position size
- `DISPUTED_TRUTH` halts new orders
- `UNKNOWN_STATE` enters safe mode

Relevant file:

- `src/runtime/truth-confidence.ts`

### 8. Idempotency

Every state-mutating order path must have an idempotency key.

The runtime injects or validates idempotency keys for intent and order submission paths. Live execution also validates client order IDs and rejects duplicate pending or submitted keys.

Relevant files:

- `src/runtime/runtime.ts`
- `src/live-execution/binance-live-execution.ts`
- `src/infra/idempotency-cache.ts`

### 9. Risk and Execution

Intent events are evaluated by risk before execution. If risk rejects, the runtime enters safe behavior and may emit risk alerts.

In non-live/dry-run mode, execution is simulated. In live mode, Binance execution gates apply before any REST order is submitted.

Live safety gates include:

- runtime profile must be `LIVE`
- dry run must be disabled
- kill switch must be clear
- production endpoint required for mainnet
- explicit live trading confirmation required
- API credentials required
- idempotency key required
- fresh exchange snapshot required
- daily loss state must be known
- notional and exposure caps enforced
- one-position rule enforced

Relevant files:

- `src/risk/risk-engine.ts`
- `src/execution/execution-engine.ts`
- `src/live-execution/binance-live-execution.ts`

### 10. Portfolio and Reconciliation

The portfolio applies fills and position updates. If expected local state conflicts with exchange-observed position state, the runtime fails closed.

Example:

- local expected position differs from exchange position update
- runtime audits `position_mismatch`
- risk halts
- runtime enters `SAFE_MODE`

Relevant files:

- `src/portfolio/portfolio-state.ts`
- `src/runtime/runtime.ts`

### 11. Replay

Replay is deterministic and uses exchange time as truth. Replay validates persisted events and confirms that current config fingerprint matches startup evidence.

Replay can bypass duplicate checks only when the runtime is explicitly in `REPLAY` mode.

Relevant files:

- `src/replay/replay-engine.ts`
- `src/runtime/replay-engine.ts`
- `src/runtime/runtime.ts`

### 12. Operator Discipline

Operator overrides are controlled by an immutable ledger.

Rules:

- override quota per 24 hours
- high-severity actions require dual authorization
- overrides require evidence
- records are immutable append-only entries

Relevant file:

- `src/oversight/operator-override-ledger.ts`

### 13. Process Memory And Survivability

The runtime monitors process survivability:

- heap pressure
- GC pause ratio
- async queue pressure
- survivability CPU overhead
- survivability memory overhead
- deterministic restart cadence
- post-restart state re-verification

If restart cadence is due, the runtime requires state re-verification using evidence such as config fingerprint and checkpoint state.

Relevant file:

- `src/runtime/process-survivability.ts`

### 14. Edge Accounting Law

The runtime treats safety as economically costly. Every subsystem must justify itself.

Daily edge reports include:

```ts
interface EdgeAttributionReport {
  reportId: string;
  periodStart: number;
  periodEnd: number;
  currency: string;
  strategyGrossEdgeBps: number;
  executionQualityEdgeBps: number;
  survivabilityOverheadBps: number;
  reconciliationCostBps: number;
  governancePenaltyBps: number;
  operationalOverheadBps: number;
  infrastructureComplexityCostBps: number;
  netRealizedEdgeBps: number;
  edgeDecayRateBpsPerDay: number;
  survivabilityRatio: number;
  economicViabilityScore: number;
}
```

Mandatory economic rules:

- generate report daily
- if net realized edge is non-positive for seven consecutive days, enter `ECONOMICALLY_UNVIABLE`
- every subsystem must maintain ROI ratio above `2.0x`
- survivability cost must not exceed 60 percent of gross edge
- minimum viable net edge is `0.05 bps/day`
- survivability overhead must not exceed 15 percent of total CPU/memory

The code clearly separates:

- Market Edge: strategy alpha and gross trading edge
- Runtime Edge: execution quality and operational improvement
- Costs: survivability, reconciliation, governance, operation, infrastructure complexity

Relevant files:

- `src/economy/edge-attribution.ts`
- `src/runtime/runtime.ts`
- `src/dashboard/dashboard-runtime-view.ts`

### 15. Evidence And Audit

All decisions and state-affecting actions are recorded through audit or tamper-evident evidence logs.

Evidence is append-only and hash-chained where the tamper-evident evidence log is used.

Relevant files:

- `src/audit/audit-log.ts`
- `src/audit/tamper-evident-evidence-log.ts`
- `src/runtime/runtime.ts`

## Dashboard Process

The dashboard has runtime, replay, portfolio, timeline, and edge-attribution views.

Edge Attribution is a primary section because economic viability is a core runtime safety law, not a secondary metric.

Relevant files:

- `src/dashboard/dashboard-models.ts`
- `src/dashboard/dashboard-runtime-view.ts`
- `src/dashboard/dashboard-pnl-view.ts`
- `src/dashboard/dashboard-replay-view.ts`
- `src/dashboard/dashboard-timeline-view.ts`

## Test Process

Main test coverage is centralized in:

- `tests/runtime.test.ts`

The tests cover:

- conflict resolution
- authority hierarchy
- causal ordering
- clock skew
- payload trust scoring
- truth confidence model
- runtime state transitions
- config fingerprinting
- operator override discipline
- idempotency
- process survivability
- economic viability gates
- edge attribution dashboard section
- live execution gates
- replay determinism
- portfolio reconciliation

Run:

```bash
pnpm typecheck
pnpm test
```

Current expected result:

- TypeScript typecheck passes
- Test suite passes with 556 tests

## How Contributors Should Approach Improvements

### Step 1: Preserve Determinism

Any new feature must be deterministic under replay. If it depends on time, randomness, external data, or async ordering, it must capture evidence and replay using recorded truth.

### Step 2: Define Authority

If a feature changes state, define what authority it trusts:

- exchange REST
- exchange WebSocket
- local runtime
- operator
- governance
- replay evidence

Lower authority must not silently override higher authority.

### Step 3: Emit Evidence

Every material decision must emit audit or evidence:

- accepted events
- rejected events
- state transitions
- confidence downgrades
- operator overrides
- economic reports
- restart re-verification
- config drift

### Step 4: Add Tests First Or Alongside

New behavior should add tests in `tests/runtime.test.ts` or a focused test file if the area grows too large.

Minimum useful tests:

- happy path
- unsafe path
- replay/determinism path
- evidence/audit path

### Step 5: Respect Economic Viability

Do not add a safety or governance subsystem without defining its cost and expected edge contribution.

Every subsystem should be explainable in terms of:

- what failure it prevents
- what edge it preserves
- what operational cost it adds
- whether ROI remains above `2.0x`

### Step 6: Fail Closed

If the runtime cannot establish truth, it should not trade.

Expected fail-closed outcomes:

- `SAFE_MODE`
- `GOVERNANCE_HALT`
- `ECONOMICALLY_UNVIABLE`
- `HALTED`

## Known Improvement Areas

Useful next work for contributors:

- Split `tests/runtime.test.ts` into focused test files as coverage grows
- Persist tamper-evident evidence logs to durable storage
- Add richer dashboard rendering for Edge Attribution and truth confidence
- Add real GC pause instrumentation using Node performance hooks
- Add live exchange REST reconciliation loops for periodic `/account` and `/order/:id`
- Expand economic reporting with per-strategy and per-symbol attribution
- Add alert routing for `ECONOMICALLY_UNVIABLE`
- Add formal documentation for every runtime transition rule
- Add property-based tests for causal reorder edge cases
- Add long-running soak tests for process survivability

## Summary

This repo is an autonomous trading runtime built around a strict principle:

Trading is allowed only when exchange truth, causal ordering, configuration integrity, operator discipline, process survivability, and economic edge are all defensible.

The runtime should not merely continue running. It must continuously prove that it is safe, replayable, and economically worth operating.
