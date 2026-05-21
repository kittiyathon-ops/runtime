export const SIMPLICITY_DOCTRINE = Object.freeze([
  "simplify_before_expanding",
  "preserve_clarity_over_abstraction",
  "preserve_operability_over_theoretical_completeness",
  "remove_what_cannot_justify_survival"
] as const);

export function simplicityDoctrine(activeDoctrine: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("simplicity_doctrine_requires_evidence");
  const active = new Set(activeDoctrine);
  const missing = SIMPLICITY_DOCTRINE.filter((doctrine) => !active.has(doctrine));
  return {
    status: missing.length === 0 ? "DOCTRINE_ACTIVE" as const : "DOCTRINE_INCOMPLETE" as const,
    missing,
    evidenceIds: [...evidenceIds]
  };
}
