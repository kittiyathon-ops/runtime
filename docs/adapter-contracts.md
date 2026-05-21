# Adapter Contracts

Exchange adapters isolate external protocol details from runtime core.

The Binance scaffold under `src/adapters/binance/` is split into:

- `binance-adapter.ts`: exchange-level orchestration contract
- `binance-websocket.ts`: lifecycle and idempotent websocket delivery
- `binance-rest.ts`: REST boundary placeholder
- `binance-event-normalizer.ts`: exchange payload to `EventInput`

Adapters must emit canonical runtime event inputs and avoid leaking raw exchange payload structure into runtime internals.

Required properties:

- normalized event output
- idempotent event delivery
- reconnect lifecycle visibility
- no strategy logic
- no runtime state mutation
- no live order execution in adapter scaffolding

Future multi-exchange adapters should implement the same boundary: external protocol in, canonical runtime contract out.
