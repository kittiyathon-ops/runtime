export function retainedSemantics(requiredSemantics: readonly string[], retained: readonly string[], evidenceIds: string[]) {
  if (requiredSemantics.length === 0 || retained.length === 0 || evidenceIds.length === 0) throw new Error("retained_semantics_require_evidence");
  const retainedSet = new Set(retained);
  const missing = [...requiredSemantics].filter((semantic) => !retainedSet.has(semantic)).sort();
  return { status: missing.length === 0 ? "REQUIRED_SEMANTICS_RETAINED" as const : "REQUIRED_SEMANTICS_MISSING" as const, missing, semanticReinterpretationAllowed: false, evidenceIds: [...evidenceIds] };
}
