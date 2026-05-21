export function selfNonself(signature: string, selfSignatures: readonly string[], evidenceIds: string[]) {
  if (signature.length === 0 || evidenceIds.length === 0) throw new Error("self_nonself_requires_evidence");
  return { classification: selfSignatures.includes(signature) ? "SELF" as const : "NON_SELF" as const, signature, evidenceIds: [...evidenceIds] };
}
