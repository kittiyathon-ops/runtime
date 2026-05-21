# Ontology Hygiene

Ontology hygiene protects semantic stability during long-running runtime operation. It is recommendation-only by design.

The subsystem may detect overlap, drift, pressure, doctrine conflict, and merge candidates. It must never merge concepts, reinterpret doctrine, mutate governance semantics, or rewrite ontology autonomously.

## Implementation Plan

1. Record ontology observations as append-only evidence.
2. Detect concept overlap from explicit primitive sets.
3. Detect semantic drift from missing protected terms.
4. Detect ontology pressure from bounded concept, overlap, and drift thresholds.
5. Evaluate doctrine conflict before any semantic evolution review.
6. Produce merge-candidate recommendations only after replay, doctrine, governance, operator, semantic attestation, and replay compatibility validations are complete.
7. Preserve audit records for every recommendation, block, and attestation.

## Failure Semantics

Ontology hygiene fails closed when evidence is missing, approval chains are incomplete, replay compatibility risk is high, governance semantic fracture risk is high, or audit records are absent.

Failed ontology hygiene does not stop operational recovery domains such as websocket reconnect, stale feed isolation, queue recovery, replay recovery, degraded mode activation, or capital freeze. It does block semantic evolution review readiness.

## Approval Chain

Semantic evolution requires:

- replay-safe validation
- doctrine-safe validation
- governance approval
- operator approval
- semantic attestation
- replay compatibility verification

Even with a complete approval chain, the runtime emits only a recommendation or review-ready attestation. Mutation remains outside autonomous runtime authority.

## Core Invariant

Runtime recovery may occur automatically. Runtime identity must not mutate automatically.

If ontology, semantics, or governance meaning changes without explicit approval, the runtime may continue executing but it is no longer the same runtime. Ontology hygiene treats that as a semantic identity failure, not an optimization opportunity.
