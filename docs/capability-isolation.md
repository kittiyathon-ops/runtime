# Capability Isolation

Capability isolation enforces least-authority runtime doctrine.

## Authority Matrix

| Layer | Allowed |
| --- | --- |
| Edge | recommend only |
| Governance | authorize only |
| Recovery | restore only |
| Runtime | execute only |
| Observability | observe only |
| Simulation | sandbox only |

## Rules

- No cross-boundary mutation.
- No unauthorized execution.
- No capability escalation.
- No implicit authority inheritance.
- Mutation authority must be explicit, reconciled, and provenance-bound.

## Failure Semantics

Contain authority leakage before shutdown. If containment fails, fail closed.
