export function semanticIdentity(expected: string, actual: string, evidenceIds: string[]) {
  if (expected.length === 0 || actual.length === 0 || evidenceIds.length === 0) throw new Error("semantic_identity_requires_evidence");
  return { status: expected === actual ? "SAME_MEANING" as const : "MEANING_CHANGED" as const, evidenceIds: [...evidenceIds] };
}
