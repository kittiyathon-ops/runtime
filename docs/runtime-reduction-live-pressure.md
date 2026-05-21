# Runtime Reduction and Live Pressure

V91-V92 validate survivability under sustained operational pressure and identify the minimum survivable runtime core.

## Live Pressure

`src/live-pressure/*` provides deterministic pressure harness primitives:

- bounded chaos schedules
- entropy acceleration
- operator collapse simulation
- replay survivability checks
- pressure orchestration
- degradation monitoring
- divergence detection
- append-only survivability recording

## Minimal Kernel

`src/minimal-kernel/*` defines the irreducible survivability core:

- identity continuity
- invariant enforcement
- causal timeline
- operational truth
- safe degradation
- recovery orchestration

## Failure Semantics

- Missing evidence throws.
- Unbounded chaos, entropy, divergence, or degradation returns unsafe status.
- Minimal kernel attestation fails if required continuity primitives are missing.
- The harness never performs irreversible corruption or hidden pressure injection.

## Integration Boundaries

The layer produces deterministic validation signals only. It does not mutate runtime state, rewrite governance, delete capabilities, or introduce opaque adaptation.
