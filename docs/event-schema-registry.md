# Event Schema Registry

Canonical event contracts live under `src/contracts/`.

Responsibilities:

- define canonical event types
- define explicit event payload versions
- validate payloads by event type and version
- evaluate schema compatibility for replay
- prevent exchange-specific payload leakage into runtime core

The registry is intentionally conservative. Current compatibility rules accept same-version and forward runtime upgrades while rejecting downgrades.

Adapters must normalize raw exchange payloads into canonical `RuntimeEvent` or `EventInput` contracts before runtime core consumes them.
