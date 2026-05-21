# ADR 0002: Append-Only Evidence Tracking

## Status

Accepted

## Decision

Represent operational reality with append-only evidence and assertions.

## Rationale

Reality in the runtime is temporal, disputable, and provenance-bound. Updating evidence in place would destroy lineage and make replay explanations unreliable.

## Consequences

- Evidence records are immutable once accepted.
- Assertions require supporting evidence.
- Contradictions are represented explicitly.
- Disputed assertions are excluded from operational reality.
