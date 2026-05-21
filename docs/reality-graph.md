# Reality Graph Foundation

The Reality Graph models operational reality as provenance-bound assertions, not truth.

It is a deterministic, append-only subsystem for separating:

- observed reality
- inferred reality
- trusted reality
- operational reality
- disputed reality
- historical reality

## Invariants

- Deterministic only.
- Append-only evidence tracking.
- No runtime mutation of accepted evidence or assertions.
- All assertions require provenance.
- All assertions require supporting evidence.
- Confidence scores must include an explanation.
- No hidden evidence state.
- Replay-safe sequencing.
- Timeline-consistent validity windows.

## Non-Goals

- No machine learning.
- No autonomous policy mutation.
- No direct risk mutation.
- No distributed consensus.
- No hidden heuristics.
- No exchange transport ownership.

## Failure Philosophy

- Fail closed on integrity uncertainty.
- Preserve explainability over availability.
- Preserve survivability over optimization.
- Exclude disputed assertions from operational reality.

## Runtime Epistemology

The runtime must not treat observations as truth. Observations become evidence. Evidence may support assertions. Assertions may become operational only when they satisfy explicit confidence, provenance, timeline, and dispute constraints.

All runtime reality state is:

- probabilistic
- temporal
- disputable
- degradable
- provenance-bound

## Type System

`RealityEvidence` records observed or imported facts:

- `evidenceId`
- `evidenceSeq`
- `timestamp`
- `subjectId`
- `kind`
- `provenance`
- `validFrom`
- `validUntil`
- `payload`

`RealityAssertion` records a claim about a subject:

- `assertionId`
- `assertionSeq`
- `timestamp`
- `subjectId`
- `layer`
- `predicate`
- `value`
- `confidence`
- `confidenceExplanation`
- `provenance`
- `validFrom`
- `validUntil`
- `degradationWeight`
- `supportingEvidence`
- `contradictingEvidence`
- `disputeStatus`

## Deterministic Interfaces

- `appendEvidence(input)` validates and appends one evidence record.
- `appendAssertion(input)` validates provenance, supporting evidence, and timeline consistency before appending.
- `operationalReality(subjectId, predicate, asOf, threshold)` returns the deterministic operational assertion if one qualifies.
- `validate()` returns integrity issues without mutating graph state.
- `allEvidence()` and `allAssertions()` expose append-only read models.

## Integration Boundaries

Future runtime integration should feed canonical events into `RealityEvidence`, then let policy-owned components produce `RealityAssertion` records. Risk, execution, and governance should consume operational reality read models only; they should not mutate Reality Graph records.

Dashboard integration can surface:

- assertion confidence
- effective confidence after degradation
- supporting and contradicting evidence IDs
- dispute status
- validity windows
- provenance references
