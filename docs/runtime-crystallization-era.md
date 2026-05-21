# Runtime Crystallization Era

V96-V100 reduce runtime surface area without autonomous deletion or doctrine mutation.

## Implementation Boundaries

- Kernel decisions require evidence and preserve identity continuity, replay integrity, governance invariants, operational truth, recovery ordering, and degradation doctrine.
- Semantic reduction is recommendation-only and requires operator/governance approval before any semantic change.
- Replay compression is certified only when boundaries, causal meaning, replay equivalence, and governance meaning are preserved.
- Minimalism scoring is deterministic and explainable; quarantine candidates require human review.
- Long-horizon simulation detects slow degradation across 30-day, 90-day, and one-year windows.

## Failure Semantics

- Missing evidence throws a deterministic `*_requires_evidence` error.
- Invariant loss rejects attestation.
- Compression uncertainty produces a risk report path instead of applying compression.
- Semantic overlap and duplication produce recommendations only.
- Negative minimalism scores create quarantine candidates, never removals.

## Integration Plan

Use these modules as read-only evaluators after replay validation and before governance review. Persist returned statuses and evidence IDs in the audit log. Apply no destructive refactor until a human-approved ADR explicitly authorizes the specific change.
