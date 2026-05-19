# Dependency Graph

```text
src/index.ts
  -> runtime/runtime.ts

runtime/runtime.ts
  -> adapters/binance.ts
  -> audit/audit-log.ts
  -> core/clock.ts
  -> core/event.ts
  -> core/ids.ts
  -> execution/execution-engine.ts
  -> infra/config.ts
  -> infra/event-bus.ts
  -> infra/event-store.ts
  -> infra/logger.ts
  -> infra/shutdown.ts
  -> infra/sqlite-event-store.ts
  -> portfolio/portfolio-state.ts
  -> replay/replay-engine.ts
  -> risk/risk-engine.ts
  -> runtime/state-machine.ts

adapters/binance.ts
  -> core/clock.ts
  -> core/event.ts
  -> core/ids.ts
  -> infra/config.ts
  -> infra/logger.ts
  -> ws

execution/*
  -> core/event.ts
  -> core/ids.ts
  -> core/time.ts
  -> portfolio/portfolio-state.ts
  -> risk/risk-engine.ts

risk/*
  -> core/event.ts
  -> portfolio/portfolio-state.ts

infra/*
  -> core/*

Rule:
  core has no domain dependencies.
  infra depends only on core and external libraries.
  domain subsystems depend on core/infra-adjacent interfaces.
  runtime composes everything.
  adapters emit normalized events and do not own runtime state.
```
