export function kernelRecovery(artifacts: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("kernel_recovery_requires_evidence");
  const required = ["identity", "memory", "governance", "truth"];
  const artifactSet = new Set(artifacts);
  const missing = required.filter((artifact) => !artifactSet.has(artifact));
  return { status: missing.length === 0 ? "REBUILD_READY" as const : "INSUFFICIENT" as const, missing, evidenceIds: [...evidenceIds] };
}
