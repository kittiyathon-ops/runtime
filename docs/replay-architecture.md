# Replay Architecture

Replay is deterministic and sequence-first.

`src/runtime/replay-engine.ts` owns:

- replay cursor state
- replay watermark
- replay lag
- pause/resume status
- realtime, accelerated, and step replay modes
- integrity validation

Replay depends on the infra `Clock` abstraction. It does not read wall time directly and does not depend on exchange adapters.

Integrity validation detects:

- missing sequence numbers
- duplicate sequence numbers
- out-of-order events

Replay handlers are injected by callers. This keeps reconstruction, simulation, debugging, and audit replay as separate use cases over the same ordered event stream.
