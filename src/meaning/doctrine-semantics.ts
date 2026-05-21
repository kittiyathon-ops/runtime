export function doctrineSemantics(doctrineId: string, interpretation: string, evidenceIds: string[]) {
  if (doctrineId.length === 0 || interpretation.length === 0 || evidenceIds.length === 0) throw new Error("doctrine_semantics_requires_evidence");
  return Object.freeze({ doctrineId, interpretation, evidenceIds: [...evidenceIds], replaySafe: true as const });
}
