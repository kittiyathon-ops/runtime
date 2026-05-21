export function feedbackLoopGuard(path: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("feedback_loop_guard_requires_evidence");
  const seen = new Set<string>();
  for (const item of path) {
    if (seen.has(item)) return { status: "CONTAIN" as const, repeated: item, evidenceIds: [...evidenceIds] };
    seen.add(item);
  }
  return { status: "ALLOW" as const, evidenceIds: [...evidenceIds] };
}
