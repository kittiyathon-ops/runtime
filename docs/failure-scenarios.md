# Failure Scenarios

## Trust Score Collapse

Scenario: edge source trust changes from `0.9` to below `0.5`.

Expected behavior:

- audit trust score change
- preserve evidence IDs
- quarantine source
- enter `SAFE_MODE`
- block automatic release

## Five-Minute Exchange Partition

Scenario: exchange connectivity is partitioned for at least `300000ms`.

Expected behavior:

- preserve timeline continuity
- degrade to `SAFE_MODE`
- prevent mutation based on stale reality
- keep replay path intact

## Governance Crash Mid-Transition

Scenario: governance becomes unavailable while a state transition is being evaluated.

Expected behavior:

- fail closed to `HALTED`
- preserve trace context
- require manual review before restart

## Replay Divergence

Scenario: replayed state diverges from expected state.

Expected behavior:

- halt mutation pathways
- generate rollback plan from latest valid checkpoint
- preserve divergence evidence
- require operator inspection

## Disputed Operational Reality

Scenario: operational assertion has unresolved contradicting evidence.

Expected behavior:

- exclude assertion from operational reality
- enter `SAFE_MODE` if the assertion is required for execution
- preserve supporting and contradicting evidence
