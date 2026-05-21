export const SURVIVABILITY_PRIMITIVES = Object.freeze([
  "preserve_identity_lineage",
  "preserve_constitutional_invariants",
  "preserve_replayable_truth",
  "preserve_governance_legitimacy",
  "preserve_operator_explainability",
  "preserve_safe_halt",
  "preserve_recovery_path"
] as const);

export type SurvivabilityPrimitive = typeof SURVIVABILITY_PRIMITIVES[number];

export function survivabilityPrimitives(retained: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("survivability_primitives_require_evidence");
  const retainedSet = new Set(retained);
  const missing = SURVIVABILITY_PRIMITIVES.filter((primitive) => !retainedSet.has(primitive));
  return {
    status: missing.length === 0 ? "PRIMITIVES_COMPLETE" as const : "PRIMITIVES_INCOMPLETE" as const,
    retained: [...retained].sort(),
    missing,
    evidenceIds: [...evidenceIds]
  };
}
