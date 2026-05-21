# ADR 0023: Operational Convergence and Simplicity

## Status

Accepted

## Context

The runtime contains many mature survivability layers. The dominant risk is now semantic inflation: abstraction depth increasing faster than operational leverage.

## Decision

Add `src/convergence/*` and `src/simplicity/*` as deterministic evaluators for abstraction collapse, survivability primitive attestation, complexity-value scoring, and auditable simplification recommendations.

## Consequences

- Convergence can be evaluated without destructive refactoring.
- Removal candidates must preserve continuity, replay, explainability, and reversibility.
- Required survivability primitives become explicit.
- Mature architecture gains a mechanism for deciding what not to build.
