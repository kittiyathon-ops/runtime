# Risk Governor

`src/runtime/risk-governor.ts` is an advisory runtime safety component.

It evaluates runtime observations such as:

- exposure
- leverage
- drawdown
- order reject rate
- volatility
- replay consistency
- persistence stability

It returns a structured recommendation:

- `OK`
- `REDUCE_ONLY`
- `PASSIVE_ONLY`
- `SAFE_MODE`
- `HALT`
- `KILL_SWITCH`

The governor does not mutate runtime state. Runtime code remains responsible for deciding whether and how to apply recommendations.

Risk governor events can be converted to canonical `RISK_ALERT` events for audit and replay.
