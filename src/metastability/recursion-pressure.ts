export function recursionPressure(depth: number, maxDepth: number, evidenceIds: string[]) {
  if (maxDepth <= 0 || depth < 0 || evidenceIds.length === 0) throw new Error("recursion_pressure_requires_evidence");
  const pressure = depth / maxDepth;
  return { status: pressure >= 1 ? "CRITICAL" as const : pressure >= 0.7 ? "HIGH" as const : "BOUNDED" as const, pressure, evidenceIds: [...evidenceIds] };
}
