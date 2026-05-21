export function capabilitySacrifice(capabilities: readonly string[], preserve: readonly string[], evidenceIds: string[]) {
  if (capabilities.length === 0 || evidenceIds.length === 0) throw new Error("capability_sacrifice_requires_evidence");
  const preserveSet = new Set(preserve);
  const sacrificed = capabilities.filter((capability) => !preserveSet.has(capability)).sort();
  return { status: sacrificed.length > 0 ? "CAPABILITY_SACRIFICED" as const : "NO_SACRIFICE" as const, sacrificed, evidenceIds: [...evidenceIds] };
}
