# ADR 0022: Runtime Mortality

## Status

Accepted

## Context

The runtime has accumulated survivability, identity, governance, reality arbitration, and metastability layers. A mature autonomous runtime must also terminate coherently when constitutional legitimacy or existential continuity is no longer recoverable.

## Decision

Add `src/mortality/*` as a deterministic, replay-safe, append-only terminal modeling layer. The layer provides graceful collapse ordering, identity-preserving shutdown, final epistemic state capture, constitutional death detection, survivable handoff verification, and terminal attestation.

## Consequences

- Runtime death becomes auditable rather than implicit.
- Terminal lineage can survive process shutdown.
- Constitutional illegitimacy can terminate authority even when execution remains technically possible.
- The layer does not perform destructive shutdown actions; it only produces deterministic terminal artifacts for orchestration by higher-level runtime code.
