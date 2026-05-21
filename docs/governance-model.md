# Governance Model

The governance state machine coordinates survivability states independently from exchange adapters and strategy logic.

States:

- `NORMAL`
- `DEGRADED`
- `SAFE_MODE`
- `HALTED`
- `REPLAY`
- `SHADOW`

Triggers include:

- stale feed
- replay mismatch
- persistence instability
- reject-rate spike
- adapter disconnect storm
- replay mode activation
- shadow runtime activation

Governance recommendations and transitions are inspectable. Invalid transitions fail clearly. The state machine does not place orders and does not own exchange connectivity.
