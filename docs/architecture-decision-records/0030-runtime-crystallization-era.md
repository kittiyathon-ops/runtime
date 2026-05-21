# ADR 0030: Runtime Crystallization Era

## Status

Accepted.

## Context

The runtime has accumulated many survivability layers. The next survivability risk is not missing capability; it is semantic overload, replay growth, and architecture self-weight.

## Decision

Add V96-V100 reduction modules as additive, deterministic, audit-backed evaluators:

- `kernel-core` extracts non-removable survivability invariants and classifies module necessity.
- `semantic-surface` detects ontology growth, duplication, synonym conflicts, and overlapping abstractions.
- `replay-compression` certifies whether replay compression preserves causal meaning.
- `minimalism` scores subsystem value against complexity and flags quarantine candidates for human review.
- `long-horizon` simulates 30-day, 90-day, and one-year survivability pressure.

These modules recommend, certify, or reject. They do not delete modules, merge ontology, mutate doctrine, reinterpret semantics, or apply compression.

## Consequences

Runtime reduction becomes auditable without weakening invariants. Human review remains mandatory for removals, quarantine, semantic changes, and compression risk acceptance.
