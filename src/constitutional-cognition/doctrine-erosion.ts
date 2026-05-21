export function doctrineErosion(requiredDoctrine: readonly string[], activeDoctrine: readonly string[], evidenceIds: string[]) {
  if (requiredDoctrine.length === 0 || evidenceIds.length === 0) throw new Error("doctrine_erosion_requires_evidence");
  const active = new Set(activeDoctrine);
  const eroded = requiredDoctrine.filter((item) => !active.has(item));
  return { status: eroded.length > 0 ? "ERODING" as const : "INTACT" as const, erosionScore: eroded.length / requiredDoctrine.length, eroded, evidenceIds: [...evidenceIds] };
}
