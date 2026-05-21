# ADR 0027: Runtime Compression and Operational Selection

## Status

Accepted

## Context

Protective architecture has become large enough to create operational self-weight. The runtime needs compression recommendations, cold-start recovery proof, and long-horizon stability checks.

## Decision

Add `src/semantic-compression-pass/*`, `src/cold-start/*`, and `src/time-horizon/*` as deterministic, audit-friendly validation systems. They recommend compression, verify cold-start reconstruction from append-only evidence, and measure long-horizon stability.

## Consequences

- Semantic compression becomes explicit and auditable.
- Cold-start recovery is treated as a survivability proof.
- Long-horizon drift and entropy become measurable.
- No code is removed automatically.
