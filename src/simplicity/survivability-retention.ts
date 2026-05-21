export const NON_REMOVABLE_CAPABILITIES = Object.freeze([
  "constitutional_continuity",
  "replay_determinism",
  "identity_lineage",
  "safe_halt",
  "operator_explainability",
  "recovery_pathway"
] as const);

export function survivabilityRetention(retainedCapabilities: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("survivability_retention_requires_evidence");
  const retained = new Set(retainedCapabilities);
  const missing = NON_REMOVABLE_CAPABILITIES.filter((capability) => !retained.has(capability));
  return {
    status: missing.length === 0 ? "RETENTION_SAFE" as const : "RETENTION_UNSAFE" as const,
    missing,
    evidenceIds: [...evidenceIds]
  };
}
