import {
  RealityAssertionSchema,
  RealityEvidenceSchema,
  type OperationalReality,
  type RealityAssertion,
  type RealityEvidence,
  type RealityGraphIntegrityIssue
} from "./reality-types.js";

export interface RealityGraphOptions {
  operationalConfidenceThreshold: number;
}

export interface AppendEvidenceInput extends Omit<RealityEvidence, "evidenceSeq"> {
  evidenceSeq?: number;
}

export interface AppendAssertionInput extends Omit<RealityAssertion, "assertionSeq"> {
  assertionSeq?: number;
}

const DEFAULT_OPTIONS: RealityGraphOptions = {
  operationalConfidenceThreshold: 0.8
};

export class RealityGraph {
  private readonly evidence: RealityEvidence[] = [];
  private readonly assertions: RealityAssertion[] = [];
  private nextEvidenceSeq = 1;
  private nextAssertionSeq = 1;

  constructor(private readonly options: RealityGraphOptions = DEFAULT_OPTIONS) {
    if (options.operationalConfidenceThreshold < 0 || options.operationalConfidenceThreshold > 1) {
      throw new Error("operational_confidence_threshold_invalid");
    }
  }

  appendEvidence(input: AppendEvidenceInput): RealityEvidence {
    if (this.evidence.some((entry) => entry.evidenceId === input.evidenceId)) {
      throw new Error(`duplicate_evidence_id:${input.evidenceId}`);
    }
    const evidence = freezeRecord(RealityEvidenceSchema.parse({
      ...input,
      evidenceSeq: input.evidenceSeq ?? this.nextEvidenceSeq
    }));
    if (evidence.evidenceSeq !== this.nextEvidenceSeq) {
      throw new Error(`evidence_seq_not_append_only:${evidence.evidenceSeq}`);
    }
    this.evidence.push(evidence);
    this.nextEvidenceSeq += 1;
    return evidence;
  }

  appendAssertion(input: AppendAssertionInput): RealityAssertion {
    if (this.assertions.some((entry) => entry.assertionId === input.assertionId)) {
      throw new Error(`duplicate_assertion_id:${input.assertionId}`);
    }
    const assertion = freezeRecord(RealityAssertionSchema.parse({
      ...input,
      assertionSeq: input.assertionSeq ?? this.nextAssertionSeq
    }));
    if (assertion.assertionSeq !== this.nextAssertionSeq) {
      throw new Error(`assertion_seq_not_append_only:${assertion.assertionSeq}`);
    }
    const issues = this.validateAssertion(assertion);
    if (issues.length > 0) {
      throw new Error(`reality_assertion_integrity_uncertain:${issues[0]?.reason}:${issues[0]?.id}`);
    }
    this.assertions.push(assertion);
    this.nextAssertionSeq += 1;
    return assertion;
  }

  operationalReality(subjectId: string, predicate: string, asOf: number, threshold = this.options.operationalConfidenceThreshold): OperationalReality | undefined {
    if (threshold < 0 || threshold > 1) throw new Error("operational_confidence_threshold_invalid");
    const candidates = this.assertions
      .filter((assertion) => assertion.subjectId === subjectId)
      .filter((assertion) => assertion.predicate === predicate)
      .filter((assertion) => assertion.disputeStatus !== "disputed")
      .filter((assertion) => assertion.validFrom <= asOf && (assertion.validUntil === undefined || assertion.validUntil >= asOf))
      .map((assertion) => ({
        assertion,
        effectiveConfidence: this.effectiveConfidence(assertion),
        threshold,
        explanation: [
          ...assertion.confidenceExplanation,
          `effectiveConfidence=${this.effectiveConfidence(assertion).toFixed(6)}`,
          `threshold=${threshold.toFixed(6)}`
        ]
      }))
      .filter((candidate) => candidate.effectiveConfidence >= threshold)
      .sort((left, right) =>
        right.assertion.validFrom - left.assertion.validFrom ||
        right.effectiveConfidence - left.effectiveConfidence ||
        right.assertion.assertionSeq - left.assertion.assertionSeq);

    return candidates[0];
  }

  validate(): RealityGraphIntegrityIssue[] {
    const issues: RealityGraphIntegrityIssue[] = [];
    const evidenceIds = new Set<string>();
    const assertionIds = new Set<string>();
    let previousEvidenceSeq = 0;
    let previousAssertionSeq = 0;

    for (const evidence of this.evidence) {
      if (evidenceIds.has(evidence.evidenceId)) issues.push({ reason: "duplicate_evidence_id", id: evidence.evidenceId });
      if (evidence.evidenceSeq <= previousEvidenceSeq) issues.push({ reason: "out_of_order_evidence_seq", id: evidence.evidenceId });
      evidenceIds.add(evidence.evidenceId);
      previousEvidenceSeq = evidence.evidenceSeq;
    }

    for (const assertion of this.assertions) {
      if (assertionIds.has(assertion.assertionId)) issues.push({ reason: "duplicate_assertion_id", id: assertion.assertionId });
      if (assertion.assertionSeq <= previousAssertionSeq) issues.push({ reason: "out_of_order_assertion_seq", id: assertion.assertionId });
      issues.push(...this.validateAssertion(assertion));
      assertionIds.add(assertion.assertionId);
      previousAssertionSeq = assertion.assertionSeq;
    }

    return issues;
  }

  allEvidence(): readonly RealityEvidence[] {
    return this.evidence;
  }

  allAssertions(): readonly RealityAssertion[] {
    return this.assertions;
  }

  private validateAssertion(assertion: RealityAssertion): RealityGraphIntegrityIssue[] {
    const issues: RealityGraphIntegrityIssue[] = [];
    const evidenceById = new Map(this.evidence.map((entry) => [entry.evidenceId, entry]));
    for (const evidenceId of assertion.supportingEvidence) {
      const evidence = evidenceById.get(evidenceId);
      if (evidence === undefined) {
        issues.push({ reason: "missing_supporting_evidence", id: evidenceId });
      } else if (assertion.validFrom < evidence.validFrom) {
        issues.push({ reason: "assertion_precedes_evidence", id: assertion.assertionId });
      }
    }
    for (const evidenceId of assertion.contradictingEvidence) {
      if (!evidenceById.has(evidenceId)) issues.push({ reason: "missing_contradicting_evidence", id: evidenceId });
    }
    return issues;
  }

  private effectiveConfidence(assertion: RealityAssertion): number {
    return assertion.confidence * (1 - assertion.degradationWeight);
  }
}

function freezeRecord<T extends object>(value: T): T {
  return Object.freeze(value);
}
