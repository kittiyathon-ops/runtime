# Runtime State Machine

Current runtime modes are defined in `src/runtime/state-machine.ts`.

Master-spec operational modes map as follows:

- `NORMAL`: runtime accepts canonical market events and DRY_RUN/PAPER execution paths.
- `DEGRADED`: represented by the governance state machine and future execution throttling.
- `SAFE_MODE`: runtime stops new order creation and preserves audit/replay records.
- `HIBERNATION_MODE`: runtime suspends new execution after repeated external instability while preserving bounded health monitoring.
- `REPLAY_ONLY`: represented by runtime `REPLAY` mode plus governance `REPLAY`.

TODO(runtime-state): add a first-class `DEGRADED` runtime mode once throttling and passive-only execution policy are wired into the main runtime orchestrator.

The next-phase governance model is defined separately in `src/runtime/governance-state-machine.ts`. It adds survivability coordination states: `NORMAL`, `DEGRADED`, `SAFE_MODE`, `HIBERNATION_MODE`, `GOVERNANCE_HALT`, `HALTED`, `REPLAY`, and `SHADOW`.

```text
NORMAL
  -> PAPER
  -> REPLAY
  -> SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

PAPER
  -> NORMAL
  -> SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

REPLAY
  -> NORMAL
  -> SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

HIBERNATION_MODE
  -> SAFE_MODE
  -> GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

GOVERNANCE_HALT
  -> STOPPING
  -> HALTED

STOPPING
  -> HALTED

HALTED
  no outbound transitions
```

Invalid transitions fail closed by setting the runtime mode to `HALTED` and throwing `invalid_runtime_transition:<from>-><to>`.

`GOVERNANCE_HALT` is the V4.5.1 integrity halt state for unrecoverable exchange divergence, ghost orders, mutable replay history, and sequence integrity breaches. It blocks ingestion and order submission while preserving evidence for operator review.

`HIBERNATION_MODE` is the bounded degradation state for repeated REST instability or compound stale-feed risk. It blocks order submission but keeps the runtime observable for health reports and non-execution evidence.

All state transitions are synchronous, explicit, and deterministic. Invalid transitions do not silently recover.

## Order Submission Gate

`RuntimeStateMachine.canSubmitOrders()` returns `true` only in:

- `NORMAL`
- `PAPER`

All other modes block new order submission. The current execution path is DRY_RUN simulation only and does not place live exchange orders.

## SAFE_MODE Behavior

`SAFE_MODE` is a terminal safety posture for trading activity. The runtime can continue to publish, persist, and audit the `SAFE_MODE` event itself, but it cannot transition back to `NORMAL`, `PAPER`, or `REPLAY`.

Expected exit path:

```text
SAFE_MODE -> STOPPING -> HALTED
```

## Shutdown Behavior

`TradingRuntime.stop()`:

```text
any active non-terminal mode
  -> STOPPING
  -> wait for ingest/event-bus drain
  -> close event store
  -> HALTED
```

Calling `stop()` after the runtime is already halted is idempotent at the shutdown controller layer.

## Governance State Machine

```text
NORMAL
  -> DEGRADED
  -> SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> HALTED
  -> REPLAY
  -> SHADOW

DEGRADED
  -> NORMAL
  -> SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> HALTED
  -> REPLAY

SAFE_MODE
  -> HIBERNATION_MODE
  -> GOVERNANCE_HALT
  -> HALTED
  -> REPLAY

HIBERNATION_MODE
  -> SAFE_MODE
  -> GOVERNANCE_HALT
  -> HALTED

GOVERNANCE_HALT
  -> HALTED

REPLAY
  -> NORMAL
  -> GOVERNANCE_HALT
  -> HALTED

SHADOW
  -> NORMAL
  -> GOVERNANCE_HALT
  -> HALTED

HALTED
  no outbound transitions
```

Governance transitions are explicit and produce inspectable transition records. Invalid transitions throw `invalid_governance_transition:<from>-><to>`.
