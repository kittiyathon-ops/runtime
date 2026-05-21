# Live Survivability Protections

## Migration Notes

Live Binance order submission now requires an explicit survivability snapshot before any order can be submitted.

Operators or orchestration code must refresh the snapshot outside the execution path:

```ts
await runtime.refreshLiveExecutionSurvivabilitySnapshot(["BTCUSDT"], ["operator_preflight_snapshot"]);
```

The snapshot reads Binance exchange filters and position risk once, records bounded local state, and is then used by `submitOrder` without additional exchange reads. If the snapshot is missing, stale, or degraded, orders are rejected locally and no `/fapi/v1/order` call is made.

Default snapshot TTL is 10 seconds. Refresh it from a scheduler or operator-controlled preflight loop. Do not refresh it from inside an order submission handler.

## Guarantees

- Capital integrity: local gates reject orders when daily loss, per-order notional, total exposure, symbol filters, leverage, or market-order policy are unsafe.
- Replay determinism: snapshot state is explicit preflight state; order submission emits deterministic accepted/rejected events and does not mutate replay history.
- Fail closed: missing, stale, incomplete, or inconsistent exchange snapshots reject orders locally.
- Hot-path discipline: order submission does not call `exchangeInfo` or `positionRisk`.
- Bounded degradation: snapshot degradation is exposed as `LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_DEGRADED` and runtime health marks live execution degraded.

## Failure Modes

| Failure | Local Reason | Effect |
| --- | --- | --- |
| Snapshot never refreshed | `exchange_snapshot_missing` or `position_snapshot_missing` | Reject order locally |
| Snapshot older than TTL | `survivability_snapshot_stale` | Reject order locally |
| Exchange info read fails | `survivability_snapshot_degraded` | Reject order locally |
| Position risk read fails | `survivability_snapshot_degraded` | Reject order locally |
| Symbol missing or not trading | `survivability_snapshot_degraded` | Reject order locally |
| Filters missing tick or step size | `survivability_snapshot_degraded` | Reject order locally |
| Exposure plus order exceeds cap | `max_exposure_limit` | Reject order locally |
| Daily loss unavailable in LIVE | `DAILY_LOSS_STATE_UNAVAILABLE` | Reject order locally |
| Daily loss over cap | `daily_loss_limit` | Reject order locally |

## Arithmetic

Order quantity, price, notional, and exposure comparisons use decimal string and `bigint` scaling instead of binary floating point. This avoids accepting an order because of unsafe float rounding near a limit.

## Operational Procedure

1. Keep `KILL_SWITCH=true` until readiness checks pass.
2. Refresh the survivability snapshot.
3. Confirm snapshot status is `LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY`.
4. Confirm `runtime.healthSnapshot().liveExecutionDegraded === false`.
5. Submit only bounded, idempotent limit orders.
6. On any snapshot degradation, keep or restore `KILL_SWITCH=true`, cancel/reconcile manually, and refresh only after Binance state is consistent.
