# ADR 0006: Temporal Integrity

## Status

Accepted

## Decision

Treat monotonic causality as a production invariant.

## Rationale

Replayable cognition depends on deterministic event ordering and rejection of future-state contamination.

## Consequences

- Replay drift is a hard failure.
- Clock regression is prohibited.
- Delayed causality is rejected outside configured windows.
