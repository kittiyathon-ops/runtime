# Runtime Consensus

Consensus is single-node scaffolding only.

Files:

- `src/runtime/divergence-detector.ts`
- `src/runtime/shadow-runtime.ts`
- `src/runtime/runtime-consensus.ts`

The system compares primary and shadow state for:

- portfolio state
- governance state
- execution validation result
- replay status

Consensus emits structured divergence reports and recommendations. It does not mutate runtime state.

Recommendations:

- `OK`
- `SAFE_MODE`
- `HALT`

Critical divergence recommends `HALT`. Warning-level divergence recommends `SAFE_MODE`.

TODO: distributed consensus, quorum voting, state repair, and replicated journals are future phases.

