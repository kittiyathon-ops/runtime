export function adaptationSandbox(sandboxed: boolean, operationallyIsolated: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("adaptation_sandbox_requires_evidence");
  return { status: sandboxed && operationallyIsolated ? "SANDBOX_READY" as const : "SANDBOX_UNSAFE" as const, evidenceIds: [...evidenceIds] };
}
