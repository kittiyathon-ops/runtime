# ADR 0026: Runtime Reduction and Live Pressure

## Status

Accepted

## Context

Architecture complexity has outgrown the execution surface. The runtime needs proof of coherent survival under pressure and a clear definition of the minimum survivable core.

## Decision

Add `src/live-pressure/*` and `src/minimal-kernel/*` as deterministic validation layers. The live-pressure harness measures bounded chaos, entropy, operator collapse, replay survivability, degradation stability, and divergence. The minimal kernel preserves only identity, invariants, causality, truth, degradation, recovery, and continuity.

## Consequences

- Survivability can be measured per unit complexity.
- Pressure validation remains replay-safe and provenance-bound.
- The minimal kernel can be attested independently from the full runtime.
- The implementation adds validation primitives without expanding runtime authority.
