Build ONLY the runtime core infrastructure.

Requirements:

* TypeScript strict mode
* typed events
* deterministic sequence generator
* async event bus
* bounded queues
* graceful shutdown
* pino logger
* zod config validation
* replay-safe event ordering

Do NOT implement:

* Binance websocket
* strategy logic
* execution engine
* risk system

Focus on:

* correctness
* determinism
* bounded memory
* replayability
