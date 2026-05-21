# Operational Manual

## Monitoring

Monitor these production budgets:

- p99 latency below `50ms`
- governance evaluation below `5ms`
- replay drift equals `0`
- event queue saturation below `0.8`
- memory RSS below configured hard limit

## Alert Escalation

- `WARNING`: inspect trend and prepare degradation.
- `CRITICAL`: enter `SAFE_MODE` or `HALTED` according to policy.
- quarantine alerts require evidence lineage.
- replay divergence alerts require rollback planning.

## Replay Inspection

Replay inspection must answer:

- which sequence diverged
- which evidence triggered divergence
- which policy was active
- which runtime state existed at the timeline point
- whether the replay drift is zero after recovery

## Governance Override

Governance override requires:

- operator identity
- traceId
- reason
- before and after state
- evidence IDs

Overrides must be append-only audit records.
