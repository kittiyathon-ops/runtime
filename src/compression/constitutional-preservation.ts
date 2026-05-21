export function constitutionalPreservation(preservedInvariants: readonly string[], requiredInvariants: readonly string[], evidenceIds: string[]) {
  if (requiredInvariants.length === 0 || evidenceIds.length === 0) throw new Error("constitutional_preservation_requires_evidence");
  const preserved = new Set(preservedInvariants);
  const missing = requiredInvariants.filter((item) => !preserved.has(item));
  return { status: missing.length === 0 ? "PRESERVED" as const : "BROKEN" as const, missing, evidenceIds: [...evidenceIds] };
}
