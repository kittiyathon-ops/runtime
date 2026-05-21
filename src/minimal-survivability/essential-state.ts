export function essentialState(retained: readonly string[], disposable: readonly string[], evidenceIds: string[]) {
  if (retained.length === 0 || evidenceIds.length === 0) throw new Error("essential_state_requires_evidence");
  const forbiddenDisposable = retained.filter((item) => disposable.includes(item));
  return {
    status: forbiddenDisposable.length === 0 ? "ESSENTIAL_STATE_MINIMAL" as const : "ESSENTIAL_STATE_CONTRADICTED" as const,
    retained: [...retained],
    disposable: [...disposable],
    forbiddenDisposable,
    evidenceIds: [...evidenceIds]
  };
}
