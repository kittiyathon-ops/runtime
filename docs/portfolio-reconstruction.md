# Portfolio Reconstruction

`src/runtime/portfolio-state-engine.ts` is the deterministic portfolio state engine. It consumes canonical runtime events only.

Supported state:

- positions
- balances
- realized PnL
- unrealized PnL
- fees
- funding
- liquidation counts
- applied fill IDs
- last applied sequence

`src/runtime/portfolio-reconstruction-engine.ts` replays canonical events into a serializable `PortfolioSnapshot` and emits `PortfolioDivergenceReport` records.

## Reconstruction Flow

```text
canonical events
-> strict sequence check
-> duplicate fill detection
-> fill application
-> mark-to-market updates
-> expected-state comparison
-> PortfolioReconstructionResult
```

The engine detects duplicate fills, out-of-order fills, missing required fills, expected position mismatch, expected balance mismatch, and expected PnL mismatch.

TODO: expand fee accounting into exchange-specific fee assets only after adapter normalization provides canonical fee events. Runtime core must not consume raw exchange payloads.

