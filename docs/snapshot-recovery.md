# Snapshot And Recovery

`src/runtime/snapshot-manager.ts` creates versioned snapshots with checkpoint sequence metadata and deterministic checksums.

Snapshots include:

- version
- snapshot id
- created timestamp supplied by caller
- checkpoint sequence
- checksum
- serializable runtime payload

`src/runtime/recovery-manager.ts` recovers from the latest valid snapshot and replays canonical events after the checkpoint.

## Recovery Modes

- `clean_recovery`
- `snapshot_recovery`
- `journal_replay_recovery`
- `partial_corruption_detected`
- `manual_intervention_required`

Recovery fails closed when snapshot validation fails or replay after checkpoint is unsafe.

TODO: database WAL repair, partial corruption repair, and snapshot storage backends are not implemented in this phase. The current manager provides deterministic recovery mechanics and explicit failure reports only.

