# Governance Runbook

Governance actions must be deterministic, timestamped, traceable, and replayable.

## Required Audit Fields

Every governance action must include:

- timestamp
- traceId
- policyId
- subjectId
- reason
- current state
- target state
- evidence IDs when degradation or quarantine occurs

## Operating Rules

- If trust score drops below `0.5`, move to `SAFE_MODE` and quarantine the affected source.
- If replay divergence is detected, halt mutation pathways and plan rollback from the latest valid checkpoint.
- If operational reality becomes disputed, move to `SAFE_MODE` until the dispute is resolved.
- If governance evaluation exceeds `5ms`, degrade cognition before execution integrity.
- If event queue saturation exceeds `0.8`, throttle non-critical cognition.
- If event queue saturation reaches `1.0`, enter `SAFE_MODE`.

## Quarantine Release

Quarantine release requires manual review.

Release criteria:

- evidence lineage inspected
- replay from quarantine point succeeds
- no unresolved contradiction remains
- operator identity recorded
- release timestamp recorded

Direct automatic quarantine release is prohibited.
