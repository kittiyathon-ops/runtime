# Survivability Validation Era

V81-V90 add deterministic validation infrastructure for coherent operation under sustained uncertainty and adversarial pressure.

## Domains

- `adversarial-runtime/*`: bounded adversarial scenarios and chaos budget orchestration.
- `invariants/*`: replay, causality, governance, identity, temporal, and recursion invariant enforcement.
- `adaptation/*`: sandboxed, rollback-safe, constitutionally bounded adaptation gates.
- `self-doubt/*`: epistemic unreliability and safe-mode triggers.
- `survivability/*`: continuity, governance, replay, epistemic, entropy, degradation, and runtime health scoring.
- `operator/*`: operator overload protection and deterministic escalation.
- `entropy/*`: long-horizon entropy accumulation controls.
- `replay-validation/*`: continuity, governance, semantic, identity, and temporal replay validation.
- `degradation/*`: deterministic capability sacrifice and graceful degradation sequencing.
- `certification/*`: machine-verifiable survivability proof and runtime attestation.

## Failure Semantics

- Missing evidence throws.
- Invariant violation halts unsafe operation.
- Adaptation promotion is blocked unless bounded, reversible, and provenance-bound.
- Self-doubt recommends safe mode before epistemic corruption spreads.
- Certification fails closed if any proof domain fails.

## Integration Boundaries

These modules emit deterministic validation decisions only. They do not mutate governance, rewrite runtime state, remove capabilities, or implement opaque learning systems.
