# Formal Verification Layer

The verification layer provides deterministic proof objects for runtime safety.

It verifies:

- invariant preservation
- legal state transitions
- replay consistency
- transition safety
- causal ordering
- governance proof traceability

## Constraints

- No probabilistic verification.
- No hidden proof state.
- Failed proofs require evidence IDs.
- All proofs require traceId.

## Integration Boundary

Verification does not mutate runtime state. It produces replay-safe reports consumed by governance, recovery, and oversight.
