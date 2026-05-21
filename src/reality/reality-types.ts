import { z } from "zod";

export const RealityLayerSchema = z.enum([
  "observed",
  "inferred",
  "trusted",
  "operational",
  "disputed",
  "historical"
]);

export type RealityLayer = z.infer<typeof RealityLayerSchema>;

export const DisputeStatusSchema = z.enum([
  "undisputed",
  "disputed",
  "resolved",
  "degraded"
]);

export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const RealityProvenanceSchema = z.object({
  source: z.string().min(1),
  eventSeq: z.number().int().nonnegative().optional(),
  eventId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  journalSeq: z.number().int().nonnegative().optional(),
  note: z.string().min(1).optional()
}).refine((value) =>
  value.eventSeq !== undefined ||
  value.eventId !== undefined ||
  value.correlationId !== undefined ||
  value.journalSeq !== undefined ||
  value.note !== undefined, "provenance_requires_reference");

export type RealityProvenance = z.infer<typeof RealityProvenanceSchema>;

export const RealityEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  evidenceSeq: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  subjectId: z.string().min(1),
  kind: z.string().min(1),
  provenance: RealityProvenanceSchema,
  validFrom: z.number().int().nonnegative(),
  validUntil: z.number().int().nonnegative().optional(),
  payload: z.record(z.string(), z.unknown())
}).refine((value) => value.validUntil === undefined || value.validUntil >= value.validFrom, "evidence_timeline_inconsistent");

export type RealityEvidence = z.infer<typeof RealityEvidenceSchema>;

export const RealityAssertionSchema = z.object({
  assertionId: z.string().min(1),
  assertionSeq: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  subjectId: z.string().min(1),
  layer: RealityLayerSchema,
  predicate: z.string().min(1),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  confidenceExplanation: z.array(z.string().min(1)).min(1),
  provenance: z.array(RealityProvenanceSchema).min(1),
  validFrom: z.number().int().nonnegative(),
  validUntil: z.number().int().nonnegative().optional(),
  degradationWeight: z.number().min(0).max(1),
  supportingEvidence: z.array(z.string().min(1)).min(1),
  contradictingEvidence: z.array(z.string().min(1)),
  disputeStatus: DisputeStatusSchema
}).refine((value) => value.validUntil === undefined || value.validUntil >= value.validFrom, "assertion_timeline_inconsistent")
  .refine((value) => value.confidence === 0 || value.confidenceExplanation.length > 0, "confidence_requires_explanation")
  .refine((value) => value.disputeStatus !== "disputed" || value.contradictingEvidence.length > 0, "disputed_assertion_requires_contradiction");

export type RealityAssertion = z.infer<typeof RealityAssertionSchema>;

export interface OperationalReality {
  assertion: RealityAssertion;
  effectiveConfidence: number;
  threshold: number;
  explanation: string[];
}

export interface RealityGraphIntegrityIssue {
  reason:
    | "duplicate_evidence_id"
    | "duplicate_assertion_id"
    | "out_of_order_evidence_seq"
    | "out_of_order_assertion_seq"
    | "missing_supporting_evidence"
    | "missing_contradicting_evidence"
    | "assertion_precedes_evidence";
  id: string;
}
