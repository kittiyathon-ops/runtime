# ADR 0028: Live Deployment Readiness Envelope

## Status

Accepted

## Context

Controlled live deployment requires deterministic evidence that the runtime remains observable, replay-certifiable, resource-bounded, cold-start recoverable, and safe under degraded venue conditions. Existing runtime subsystems already enforce append-only evidence and fail-closed governance. The new deployment-readiness layer must not rewrite those foundations.

## Decision

Add five bounded module groups:

- `src/profiling/` for deterministic growth and pressure observations.
- `src/replay-certification/` for same-input replay, governance, and reality certification.
- `src/minimal-survivability/` for collapse-state reduction.
- `src/deployment/` for live-mode gating, capital envelope checks, safe mode, venue health, and operator override preservation.
- `src/burn-in/` for deterministic degradation simulations.

Every module requires evidence identifiers, clones returned evidence arrays, and rejects ambiguous input by throwing a deterministic fail-closed error.

## Consequences

The runtime gains a live-deployment readiness surface without introducing runtime mutation, hidden state, probabilistic behavior, or strategy evolution. Failed checks preserve evidence and gate the system toward `SURVIVAL_ONLY` rather than attempting automatic escalation.
