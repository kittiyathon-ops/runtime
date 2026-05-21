# ADR 0001: Deterministic Runtime

## Status

Accepted

## Decision

Use deterministic runtime behavior instead of machine learning or hidden adaptive mutation for core operational decisions.

## Rationale

Autonomous trading infrastructure must be replayable, explainable, and auditable. Determinism allows operators to reconstruct why a decision occurred and verify that recovery produced the same state.

## Consequences

- All runtime decisions require explicit inputs.
- Replay divergence is a critical failure.
- Hidden heuristics are prohibited in governance, recovery, and budgeting paths.
