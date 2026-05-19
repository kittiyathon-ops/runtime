# Runtime State Machine

Current runtime modes are defined in `src/runtime/state-machine.ts`.

```text
NORMAL
  -> PAPER
  -> REPLAY
  -> SAFE_MODE
  -> STOPPING
  -> HALTED

PAPER
  -> NORMAL
  -> SAFE_MODE
  -> STOPPING
  -> HALTED

REPLAY
  -> NORMAL
  -> SAFE_MODE
  -> STOPPING
  -> HALTED

SAFE_MODE
  -> STOPPING
  -> HALTED

STOPPING
  -> HALTED

HALTED
  no outbound transitions
```

Invalid transitions fail closed by setting the runtime mode to `HALTED` and throwing `invalid_runtime_transition:<from>-><to>`.

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
