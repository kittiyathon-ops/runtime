# Runtime Mortality Layer

V75 adds deterministic mortality primitives for coherent shutdown under irreversible legitimacy or continuity failure.

## Doctrine

- Prefer coherent death over incoherent survival.
- Preserve continuity lineage over uptime.
- Preserve legitimacy over execution persistence.
- Preserve final truth history before authority termination.
- Never delete lineage as part of collapse.

## Terminal State Machine

1. `FREEZE_INPUTS`
2. `PRESERVE_LINEAGE`
3. `FINALIZE_TRUTH`
4. `TERMINATE_AUTHORITY`

The sequence is deterministic and replay-safe. A runtime may only declare coherent termination when constitutional death is detected and terminal identity, governance lineage, final truth, and continuity artifacts remain attestable.

## Integration Boundaries

- `mortality/*` consumes deterministic terminal evidence only.
- It does not stop processes, delete files, mutate runtime state, or bypass governance.
- Live shutdown orchestration remains outside this layer.
- Mortality artifacts are append-only and provenance-bound.

## Failure Semantics

- Missing evidence throws.
- Missing collapse phases return `COLLAPSE_UNSAFE`.
- Incomplete handoff returns `HANDOFF_BLOCKED`.
- Missing terminal continuity returns `CONTINUITY_BROKEN`.
- Incomplete terminal preservation returns `TERMINATION_UNSAFE`.

## Operational APIs

- `gracefulCollapse` validates collapse ordering.
- `IdentityPreservingShutdown` records append-only terminal identity lineage.
- `epistemicLastState` records the final replayable truth snapshot.
- `constitutionalFailure` declares constitutional death criteria.
- `survivableHandoff` verifies lineage transfer to a successor runtime.
- `mortalityAttestation` attests replayable mortality.
- `terminalContinuity` verifies final continuity artifacts.
- `CollapseLineage` records append-only collapse phases.
- `finalGovernanceState` captures final governance authority state.
- `existentialTermination` determines whether death is coherent.
