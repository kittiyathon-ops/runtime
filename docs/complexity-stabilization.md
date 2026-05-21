# Complexity Stabilization

Complexity stabilization asks how much complexity the runtime can survive.

It bounds active disputes, causal depth, unresolved contradictions, governance load, explainability recursion, semantic density, and oversight pressure.

## Interfaces

- `complexity-budget.ts` evaluates aggregate dispute and policy conflict pressure.
- `cognitive-load.ts` evaluates disputes, contradictions, and trust fractures.
- `semantic-compression.ts` compresses semantic items only when causality is preserved.
- `contradiction-budget.ts` bounds unresolved contradictions.
- `governance-load.ts` evaluates governance actions and override weight.
- `causal-depth.ts` bounds causal chain depth.
- `explainability-budget.ts` bounds explanation recursion.
- `unresolved-pressure.ts` evaluates unresolved contradiction, governance, and causal pressure.
- `recursion-guard.ts` contains recursive paths.
- `stabilization-engine.ts` combines complexity decisions into a stabilization action.

## Invariants

- Complexity growth remains bounded.
- Governance recursion remains finite.
- Explainability depth remains survivable.
- Oversight load remains manageable.

## Failure Semantics

Collapse risk triggers cognition throttling or safe mode before coherence loss.
