export function executionEssentialism(executableCapabilities: readonly string[], requiredCapabilities: readonly string[], evidenceIds: string[]) {
  if (requiredCapabilities.length === 0 || evidenceIds.length === 0) throw new Error("execution_essentialism_requires_evidence");
  const executable = new Set(executableCapabilities);
  const missing = [...requiredCapabilities].sort().filter((capability) => !executable.has(capability));
  const surplus = [...executableCapabilities].sort().filter((capability) => !requiredCapabilities.includes(capability));
  return {
    status: missing.length === 0 ? "EXECUTION_ESSENTIALS_PRESENT" as const : "EXECUTION_ESSENTIALS_MISSING" as const,
    missing,
    surplus,
    evidenceIds: [...evidenceIds]
  };
}
