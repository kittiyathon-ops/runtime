# Runtime Compression and Operational Selection

V93-V95 reduce semantic surface area and validate recovery and long-horizon stability.

## Domains

- `semantic-compression-pass/*`: overlap reports, merge recommendations, duplicate detection, retained meaning, and compression attestation.
- `cold-start/*`: evidence bootstrap, identity rehydration, timeline recovery, truth replay, governance restore, operational reality rehydration, kernel rebuild, and cold-start attestation.
- `time-horizon/*`: long-horizon runner, drift, semantic inflation, governance rot, memory saturation, replay explosion, evidence growth, stability score, and attestation.

## Failure Semantics

- Missing evidence throws.
- Compression recommendations are blocked if replay, explainability, or constitutional continuity would weaken.
- Cold start fails into constitutional failure if the kernel cannot be rebuilt.
- Long-horizon validation rejects unbounded drift, semantic growth, replay cost, evidence growth, or entropy.

## Integration Boundaries

These modules produce deterministic reports and attestations only. They do not delete code, mutate architecture, clean hidden state, or perform manual reconstruction.
