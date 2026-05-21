# ADR 0029: Ontology Hygiene Recommendation Mode

## Status

Accepted

## Context

The runtime depends on stable semantics for replay certification, constitutional validation, explainability, identity continuity, truth lineage, and governance legitimacy. Autonomous ontology merge can silently alter doctrine by making similar concepts operationally interchangeable.

Silent semantic drift is worse than a crash because historical evidence, recovery behavior, and governance meaning can be reinterpreted while the runtime appears healthy.

## Decision

Add `src/ontology-hygiene/` as a deterministic recommendation-only subsystem.

The subsystem provides:

- concept overlap analysis
- semantic drift detection
- ontology pressure detection
- doctrine conflict evaluation
- merge candidate recommendation
- semantic attestation and audit records

No API performs a merge, mutates doctrine, rewrites governance semantics, or changes ontology state.

## Consequences

Autonomous operational recovery remains allowed for transport, feed, queue, replay, degraded-mode, and capital-freeze domains. Semantic evolution is human-governed and requires replay-safe validation, doctrine-safe validation, governance approval, operator approval, semantic attestation, and replay compatibility verification.

High replay compatibility risk or governance semantic fracture risk blocks merge recommendations even when concepts overlap.
