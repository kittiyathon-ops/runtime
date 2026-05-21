# ADR 0008: Semantic Explainability

## Status

Accepted

## Decision

Introduce deterministic semantic explanation objects for governance, causality, confidence, transitions, and runtime decisions.

## Rationale

Human auditability requires more than raw events. Operators need replay-identical explanations that connect evidence, policy, causality, and confidence.

## Consequences

- Explanations require provenance.
- Confidence scores expose degradation factors.
- Unexplainable decisions are operationally invalid.
