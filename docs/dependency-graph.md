# Dependency Graph

```text
src/index.ts
  -> runtime/runtime.ts

runtime/runtime.ts
  -> audit/audit-log.ts
  -> core/clock.ts
  -> core/event.ts
  -> core/ids.ts
  -> execution/execution-engine.ts
  -> execution/paper-fill-simulator.ts
  -> execution/paper-performance-tracker.ts
  -> infra/config.ts
  -> infra/event-bus.ts
  -> infra/event-store.ts
  -> infra/logger.ts
  -> infra/shutdown.ts
  -> infra/sqlite-event-store.ts
  -> notifications/telegram-alert-builder.ts
  -> portfolio/portfolio-state.ts
  -> replay/replay-engine.ts
  -> risk/risk-engine.ts
  -> runtime/state-machine.ts
  -> signals/signal-engine.ts
  -> adapters/binance.ts

TODO(runtime-boundary):
  runtime/runtime.ts -> adapters/binance.ts is a temporary compatibility bridge.
  The target boundary is runtime/runtime.ts -> runtime/market-data-adapter.ts only.

runtime/market-data-adapter.ts
  -> core/event.ts

runtime/replay-engine.ts
  -> core/event.ts
  -> infra/clock.ts
  -> runtime/event-source.ts

runtime/event-source.ts
  -> core/event.ts

runtime/risk-governor.ts
  -> core/event.ts

runtime/execution-kernel.ts
  -> core/event.ts

runtime/portfolio-state-engine.ts
  -> core/event.ts

runtime/portfolio-reconstruction-engine.ts
  -> core/event.ts
  -> runtime/portfolio-state-engine.ts

runtime/snapshot-manager.ts
  -> core/event.ts
  -> runtime/portfolio-state-engine.ts

runtime/recovery-manager.ts
  -> core/event.ts
  -> runtime/portfolio-reconstruction-engine.ts
  -> runtime/portfolio-state-engine.ts
  -> runtime/snapshot-manager.ts

runtime/divergence-detector.ts
  -> runtime/execution-kernel.ts
  -> runtime/governance-state-machine.ts
  -> runtime/portfolio-state-engine.ts
  -> runtime/replay-engine.ts

runtime/runtime-consensus.ts
  -> runtime/divergence-detector.ts
  -> runtime/shadow-runtime.ts

dashboard/*
  -> runtime read models
  -> notification metadata
  -> no Telegram formatting dependency

edge/*
  -> infra/clock.ts where deterministic time windows are required
  -> core/event.ts for canonical runtime event comparison only
  -> notifications correlation types where edge events preserve trace metadata
  -> no runtime mutation dependency

runtime/runtime-journal.ts
  -> core/event.ts

reality/*
  -> zod for schema validation only
  -> no runtime mutation dependency
  -> no risk, execution, adapter, or consensus dependency

observability/*
  -> infra/metrics.ts for metric snapshots
  -> zod for audit and tracing validation
  -> no transport dependency

recovery/*
  -> deterministic recovery inputs only
  -> no exchange transport dependency
  -> no direct runtime mutation dependency

budget/*
  -> deterministic resource samples only
  -> no process-global sampling dependency
  -> no execution side effects

constitution/*
  -> deterministic constitutional inputs only
  -> no runtime mutation dependency
  -> no governance dependency

verification/*
  -> deterministic proof inputs only
  -> no runtime mutation dependency

capability/*
  -> explicit capability grants only
  -> no implicit authority inheritance

temporal/*
  -> deterministic time/order inputs only
  -> no wall-clock dependency

oversight/*
  -> operator-provided provenance only
  -> no hidden decision path dependency

identity/*
  -> node:crypto for deterministic sha256 fingerprints
  -> no runtime mutation dependency
  -> no governance mutation dependency

explainability/*
  -> deterministic provenance-linked explanation inputs only
  -> no hidden reasoning dependency

simulation/*
  -> deterministic adversarial scenario inputs only
  -> no runtime mutation dependency

cognitive-pressure/*
  -> deterministic normalized pressure signals only
  -> no runtime mutation dependency

meta-governance/*
  -> deterministic governance legitimacy inputs only
  -> no direct governance mutation dependency

complexity/*
  -> deterministic bounded complexity inputs only
  -> no recursion side effects

semantic-compression/*
  -> deterministic compression inputs only
  -> preserves evidence lineage

reality-integrity/*
  -> deterministic integrity inputs only
  -> no operational reality mutation dependency

constitutional-cognition/*
  -> deterministic legitimacy inputs only
  -> no governance mutation dependency

multi-reality/*
  -> deterministic probabilistic reality inputs only
  -> no forced reality collapse dependency

immune/*
  -> deterministic corruption evidence only
  -> quarantine before mutation

existential/*
  -> deterministic continuity inputs only
  -> no runtime mutation dependency

meaning/*
  -> deterministic semantic lineage inputs only
  -> no opaque reinterpretation dependency

sovereignty/*
  -> deterministic authority legitimacy inputs only
  -> no self-authorizing governance dependency

civilization/*
  -> deterministic inter-agent governance inputs only
  -> no hidden authority dependency

thermodynamics/*
  -> deterministic entropy and energy inputs only
  -> no recursive expansion side effects

kernel/*
  -> deterministic continuity artifacts only
  -> minimum viable runtime boundary

compression/*
  -> deterministic compression inputs only
  -> preserves replay and constitutional continuity

arbitration/*
  -> deterministic conflict inputs only
  -> preserves dispute history

metastability/*
  -> deterministic recursion and feedback inputs only
  -> no stabilization side effects

mortality/*
  -> deterministic terminal evidence only
  -> no destructive shutdown side effects
  -> preserves lineage before authority termination

convergence/*
  -> deterministic simplification evidence only
  -> no removal or runtime mutation dependency
  -> maps abstractions to survivability primitives

simplicity/*
  -> deterministic value and retention inputs only
  -> no destructive refactoring dependency
  -> recommendations must be reversible and evidence-bound

field/*
  -> deterministic runtime ecology observations only
  -> no runtime mutation dependency
  -> exposes operational field provenance

adaptive-immune/*
  -> deterministic threat memory inputs only
  -> no doctrine mutation dependency
  -> quarantine recommendations remain evidence-bound

economy/*
  -> deterministic cognitive budget inputs only
  -> no autonomous attention side effects
  -> preserves operator interpretability

adversarial-runtime/*
  -> deterministic adversarial scenario inputs only
  -> bounded chaos budget

invariants/*
  -> deterministic machine-verifiable invariant inputs only
  -> fail closed enforcement output

adaptation/*
  -> deterministic sandbox and rollback inputs only
  -> no self-modifying governance dependency

self-doubt/*
  -> deterministic epistemic uncertainty inputs only
  -> safe-mode recommendations only

survivability/*
  -> deterministic health scores only
  -> no profitability dependency

operator/*
  -> deterministic operator cognition inputs only
  -> no notification transport dependency

entropy/*
  -> deterministic entropy history inputs only
  -> no automatic deletion dependency

replay-validation/*
  -> deterministic long-horizon replay inputs only
  -> no replay mutation dependency

degradation/*
  -> deterministic degradation sequencing inputs only
  -> no destructive capability deletion

certification/*
  -> deterministic proof inputs only
  -> append-only certification audit

live-pressure/*
  -> deterministic pressure scenario inputs only
  -> bounded divergence and entropy validation
  -> no irreversible corruption dependency

minimal-kernel/*
  -> deterministic continuity primitive inputs only
  -> no hidden kernel mutation dependency

semantic-compression-pass/*
  -> deterministic compression recommendation inputs only
  -> no automatic code deletion dependency

cold-start/*
  -> deterministic append-only evidence inputs only
  -> no hidden recovery state dependency

time-horizon/*
  -> deterministic long-horizon simulation inputs only
  -> no hidden cleanup dependency

profiling/*
  -> deterministic bounded observation inputs only
  -> append-only evidence identifiers
  -> no runtime mutation dependency

replay-certification/*
  -> deterministic digest and degradation inputs only
  -> preserves divergence lineage and contradictions
  -> no replay execution dependency

minimal-survivability/*
  -> deterministic collapse-state primitive inputs only
  -> treats non-essential state as disposable
  -> no minimal-kernel mutation dependency

deployment/*
  -> deterministic deployment gate inputs only
  -> capital envelope and operator override checks
  -> no exchange transport dependency

burn-in/*
  -> deterministic degradation scenario inputs only
  -> no live venue dependency

ontology-hygiene/*
  -> deterministic semantic observation inputs only
  -> recommendation-only ontology reports
  -> no autonomous merge or doctrine mutation dependency

runtime/governance-state-machine.ts
  -> no runtime side effects

contracts/*
  -> core/event.ts where validation requires canonical runtime event shape

notifications/*
  -> i18n/*
  -> infra/clock.ts for deterministic deduplication and aggregation windows
  -> typed alert payloads only

runtime/runtime-timeline.ts
  -> notifications alert contracts
  -> notifications dashboard metadata

alerts/telegram-notifier.ts
  -> infra/config.ts
  -> Telegram HTTP transport

infra/health-monitor.ts
  -> infra/metrics.ts

infra/idempotency-cache.ts
  -> infra/clock.ts

adapters/binance.ts
  -> core/clock.ts
  -> core/event.ts
  -> core/ids.ts
  -> infra/config.ts
  -> infra/logger.ts
  -> ws

adapters/binance/*
  -> core/event.ts
  -> infra/clock.ts
  -> adapter-local normalization and transport

execution/*
  -> core/event.ts
  -> core/ids.ts
  -> core/time.ts
  -> portfolio/portfolio-state.ts
  -> risk/risk-engine.ts

risk/*
  -> core/event.ts
  -> portfolio/portfolio-state.ts
```

## Boundary Rules

- `core/*` has no domain dependencies.
- `infra/*` remains generic and reusable.
- `runtime/*` composes subsystems and consumes canonical events.
- `adapters/*` translate exchange payloads into canonical events and own transport details.
- Runtime state transitions are deterministic and fail closed.
- Alerts originate from structured payloads, then pass through notification formatters.
- `Date.now()` is restricted to clock implementations.
