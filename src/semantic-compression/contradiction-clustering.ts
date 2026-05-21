export interface ContradictionCluster {
  subjectId: string;
  contradictionIds: string[];
}

export function contradictionClustering(records: readonly { subjectId: string; contradictionId: string }[]): ContradictionCluster[] {
  if (records.length === 0) throw new Error("contradiction_clustering_requires_records");
  const clusters = new Map<string, string[]>();
  for (const record of records) {
    clusters.set(record.subjectId, [...(clusters.get(record.subjectId) ?? []), record.contradictionId]);
  }
  return Array.from(clusters.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([subjectId, contradictionIds]) => ({
    subjectId,
    contradictionIds: contradictionIds.sort()
  }));
}
