# Operational Convergence

V76 collapses semantic expansion into executable survivability primitives. It does not delete code or mutate runtime structure.

## Purpose

- Reduce semantic inflation.
- Identify redundant abstractions.
- Map abstractions to operational primitives.
- Preserve survivability per unit complexity.
- Keep convergence replay-safe, reversible, and auditable.

## Required Primitives

- `preserve_identity_lineage`
- `preserve_constitutional_invariants`
- `preserve_replayable_truth`
- `preserve_governance_legitimacy`
- `preserve_operator_explainability`
- `preserve_safe_halt`
- `preserve_recovery_path`

## Failure Semantics

- Missing evidence throws.
- Collapse is blocked if replay, constitutional continuity, or explainability would weaken.
- Reduction candidates are retained when they protect required primitives.
- Primitive attestation is rejected unless operational necessity, replay, and continuity are all preserved.

## Integration Boundaries

- `convergence/*` produces deterministic recommendations only.
- It has no deletion, refactoring, or runtime mutation authority.
- It may feed operator review, docs, governance review, or future manual simplification work.
