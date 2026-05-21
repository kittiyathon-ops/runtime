# ADR 0007: Runtime Identity Core

## Status

Accepted

## Decision

Represent runtime identity as deterministic continuity of doctrine, governance lineage, policy lineage, and invariant fingerprints.

## Rationale

A runtime can continue functioning while no longer behaving as the originally governed system. Identity drift detection prevents silent doctrine divergence.

## Consequences

- Identity mutation requires provenance.
- Continuity hashes are replay-stable.
- Drift fails closed until explained and attested.
