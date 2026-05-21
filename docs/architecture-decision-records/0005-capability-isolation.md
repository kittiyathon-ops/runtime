# ADR 0005: Capability Isolation

## Status

Accepted

## Decision

Use explicit capability grants and layer-specific permissions for runtime authority.

## Rationale

Least authority prevents capability leakage, unauthorized mutation, and implicit authority inheritance across subsystems.

## Consequences

- Cross-boundary mutation is denied.
- Mutation authority must be explicit and reconciled.
- Simulation remains sandbox-only.
