# ADR 0003: Manual Quarantine Release

## Status

Accepted

## Decision

Require manual review before releasing a quarantined source.

## Rationale

Automatic release can reintroduce bad data after transient recovery. Manual review ensures evidence lineage, replay health, and contradiction status are inspected before trust is restored.

## Consequences

- Quarantine records preserve evidence IDs.
- Release requires reviewer identity.
- Release requires an explicit timestamp.
- Direct release from quarantined state is invalid.
