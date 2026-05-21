# Dashboard Foundation

The dashboard layer is read-only and serializable. It does not depend on Telegram formatting and does not mutate runtime state.

Files:

- `src/dashboard/dashboard-models.ts`
- `src/dashboard/dashboard-state.ts`
- `src/dashboard/dashboard-timeline-view.ts`
- `src/dashboard/dashboard-pnl-view.ts`
- `src/dashboard/dashboard-runtime-view.ts`
- `src/dashboard/dashboard-replay-view.ts`

Supported read models:

- timeline entries
- alert stream items
- PnL summary cards
- portfolio state summary
- runtime state graph nodes and edges
- replay status
- recovery status
- consensus status

The dashboard consumes structured runtime state and severity metadata. No UI or frontend framework is implemented in this phase.

