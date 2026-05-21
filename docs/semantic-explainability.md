# Semantic Explainability

Semantic explainability converts deterministic runtime evidence into human-readable, machine-auditable explanations.

## Required Explanations

- why governance rejected a decision
- why a reality assertion was trusted
- why a source was quarantined
- why a transition was unsafe
- why confidence degraded
- why operational state changed

## Invariants

- Explanations are deterministic.
- Explanations require provenance.
- Confidence explanations expose evidence lineage.
- Causal chains must be verifiable.
- Semantic timelines are append-only.

## Failure Semantics

If a decision cannot be explained, it is not operationally acceptable.
