export function doctrinePluralism(doctrines: readonly string[], boundaryPreserved: boolean, evidenceIds: string[]) {
  if (doctrines.length === 0 || evidenceIds.length === 0) throw new Error("doctrine_pluralism_requires_evidence");
  return { status: boundaryPreserved ? "BOUNDED_PLURALISM" as const : "FRAGMENTING" as const, doctrineCount: new Set(doctrines).size, evidenceIds: [...evidenceIds] };
}
