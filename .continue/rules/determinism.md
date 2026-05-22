# Determinism Rules

Never introduce:
- hidden timers
- Date.now in replay-critical paths
- random IDs in replay-critical paths
- unordered async mutation
- silent retries
- implicit mutable global state

Use injected clocks and explicit inputs.
Replay must produce the same result from the same ordered events.
