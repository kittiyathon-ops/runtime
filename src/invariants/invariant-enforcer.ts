export function invariantEnforcer(results: readonly { invariant: string; status: "PRESERVED" | "VIOLATED"; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (results.length === 0 || evidenceIds.length === 0) throw new Error("invariant_enforcer_requires_evidence");
  const violated = results.filter((result) => result.status === "VIOLATED").map((result) => result.invariant).sort();
  return { status: violated.length === 0 ? "ALLOW_OPERATION" as const : "HALT_UNSAFE_OPERATION" as const, violated, evidenceIds: [...evidenceIds] };
}
