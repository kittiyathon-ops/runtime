# Constitutional Runtime

The Runtime Constitution defines rules that governance cannot override.

## Non-Overridable Invariants

- Never execute on disputed reality.
- Never mutate append-only evidence.
- Never bypass replay integrity.
- Never override quarantine without human review.
- Never violate survivability threshold.
- Never allow execution outside governance authority.
- Never mutate operational state without reconciliation.

## Failure Semantics

Constitutional uncertainty fails closed. Availability, throughput, and optimization are subordinate to constitutional integrity.

Every breach requires:

- timestamp
- traceId
- invariant ID
- evidence lineage
- fail-closed decision

## Integration Boundary

Governance may authorize. The constitution validates whether the authorization is permitted. Runtime execution must treat constitutional failure as a hard stop.
