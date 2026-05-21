# Temporal Integrity

Temporal integrity preserves causal continuity and monotonic runtime history.

## Invariants

- No future-state execution.
- No out-of-order governance.
- No replay drift.
- Causality remains monotonic.
- Decisions require temporal validity.
- Events require deterministic ordering.

## Failure Semantics

Temporal uncertainty is rejected. Causal integrity outranks availability.

## Integration Boundary

Temporal validators produce deterministic reports for governance and recovery. They do not repair timelines or mutate runtime state.
