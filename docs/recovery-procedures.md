# Recovery Procedures

## Safe-State Recovery

Prefer safe-state recovery over full restart.

Procedure:

- identify the active traceId
- inspect the last governance audit record
- inspect evidence lineage for degradation
- determine latest valid checkpoint
- replay from checkpoint
- compare reconstructed state to expected state
- resume only through an allowed safe-state transition

## Rollback

Rollback must preserve timeline continuity.

Procedure:

- choose the latest checkpoint at or before the current sequence
- record rollback reason
- preserve the triggering transition
- replay forward from rollback point
- halt if replay diverges

## Quarantine Release

Automatic quarantine release is prohibited.

Procedure:

- move quarantine record to `PENDING_MANUAL_REVIEW`
- inspect preserved evidence IDs
- confirm replay has no divergence
- record reviewer identity
- record release timestamp
- move source to `RELEASED`

## Emergency Stop

Emergency stop requires evidence.

Procedure:

- record timestamp
- record traceId
- record reason
- record evidence IDs
- prevent new mutation pathways
- preserve current timeline state
