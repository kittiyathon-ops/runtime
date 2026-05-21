# Edge Layer

The edge layer lives under `src/edge/`.

Its job is to evaluate external input integrity before normalized events enter runtime core.

```text
external source
-> adapter transport
-> normalization
-> edge validation/trust/latency/consensus
-> canonical runtime event
-> runtime core
```

The edge layer does not contain strategy logic and does not mutate runtime state. It emits structured reports, recommendations, and edge events for governance, risk, journal, timeline, and alert systems to consume.

## Responsibilities

- feed health
- trust scoring
- latency tracking
- reconnect gap detection
- partial disconnect detection
- duplicate delivery evidence
- sequence gap evidence
- local multi-source comparison
- edge degradation recommendation

## Edge Events

Canonical edge events include:

- `EDGE_HEALTH_CHANGED`
- `EDGE_LATENCY_SPIKE`
- `EDGE_TRUST_DEGRADED`
- `EDGE_PARTITION_DETECTED`
- `EDGE_RECONNECT_GAP`
- `EDGE_DUPLICATE_DELIVERY`
- `EDGE_SEQUENCE_GAP`
- `EDGE_FEED_STALE`
- `EDGE_FEED_RECOVERED`
- `EDGE_CONSENSUS_DIVERGENCE`

Edge events are structured, serializable, journalable, and preserve correlation IDs where available. Raw exchange payloads are not part of edge events unless future quarantine storage explicitly marks them as quarantined evidence.

## Health Model

`EdgeHealthMonitor` tracks connection state, reconnects, stale feeds, duplicate delivery, and sequence gaps.

Health levels:

- `HEALTHY`
- `DEGRADED`
- `UNTRUSTED`
- `PARTITIONED`
- `OFFLINE`

Recommendations:

- `ACCEPT`
- `THROTTLE`
- `PASSIVE_ONLY`
- `SAFE_MODE`
- `HALT_INPUT`
- `QUARANTINE_SOURCE`

## Trust Model

`EdgeTrustEvaluator` computes deterministic trust scores from:

- freshness
- duplicate delivery rate
- sequence gap count
- reconnect frequency
- latency drift
- source consistency
- replay divergence evidence

Trust levels:

- `TRUSTED`
- `SUSPECT`
- `UNTRUSTED`
- `QUARANTINED`

Untrusted input must be explicitly rejected or quarantined by orchestration. It must not be silently dropped.

## Latency Model

`EdgeLatencyTracker` uses the `Clock` abstraction and bounded rolling windows. It tracks observed, max, average, and rolling latency and emits latency-spike events when thresholds are crossed.

## Edge Consensus

`EdgeConsensus` is local-only scaffolding. Single-source mode returns explicit single-source confidence. Multi-source mode compares canonical runtime events and reports structured divergence.

This is not distributed consensus.

## Partition Detection

`EdgePartitionDetector` detects:

- partial disconnect
- silent feed
- stale packets
- reconnect gap
- local transport partition

Reports include affected sources, severity, recommendation, and structured evidence.

## Degradation Policy

`EdgeDegradationPolicy` maps health, trust, latency, consensus, and partition reports into the strongest edge recommendation. It recommends only; governance decides whether to apply.

TODO: wire edge recommendations into `GovernanceStateMachine`, runtime timeline, metrics, and structured alert routing once edge orchestration is introduced.

