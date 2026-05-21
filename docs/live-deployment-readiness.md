# Live Deployment Readiness

The deployment-readiness layer is additive and deterministic. It does not mutate runtime state, sample process globals, or alter governance authority. Each module accepts bounded input observations and append-only evidence identifiers, then returns a fail-closed decision.

## Runtime profiling

`src/profiling/` records deterministic observations for memory growth, replay growth, queue pressure, serialization cost, GC pressure, event amplification, and recovery latency. These checks detect replay explosion, semantic or serialization inflation, event storms, queue instability, cold-start degradation, memory saturation, and serialization amplification.

Profiling output is evidence-only. A rejected profiling attestation blocks live escalation instead of attempting automatic remediation.

## Replay certification

`src/replay-certification/` certifies that identical inputs produce identical outputs, governance decisions, and operational reality digests. Degraded replay explicitly covers reconnects, partitions, delayed acknowledgements, and pressure conditions.

Replay divergence preserves expected and actual digests, lineage identifiers, contradiction identifiers, and evidence identifiers. Ambiguity rejects certification and leaves the runtime in a fail-closed state.

## Minimal survivable runtime

`src/minimal-survivability/` defines the state that must survive collapse:

- identity continuity
- timeline continuity
- governance continuity
- truth lineage
- replay recoverability
- kill-switch capability
- operational attestation

All non-essential runtime state is disposable by default. Recovery seeds are digest-only and replay-oriented.

## Deployment envelope

`src/deployment/` gates deployment modes:

- `SHADOW`
- `PAPER`
- `LIMITED_CAPITAL`
- `RESTRICTED`
- `LIVE`
- `DEGRADED`
- `SURVIVAL_ONLY`

Capital access is rejected outside explicit capital-bearing modes. Failed gates collapse to `SURVIVAL_ONLY`. Operator override and kill-switch availability remain independently attestable.

## Burn-in validation

`src/burn-in/` provides deterministic pressure scenarios for websocket reconnect storms, replay floods, stale-feed bursts, delayed ACKs, exchange desync, duplicate fills, packet loss, clock drift, queue amplification, and memory pressure.

The purpose is operational coherence under sustained degradation, not profitability.
