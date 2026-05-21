export interface DoctrineVersion {
  versionId: string;
  effectiveFrom: number;
  description: string;
}

export function doctrineVersion(input: DoctrineVersion): DoctrineVersion {
  if (input.versionId.length === 0) throw new Error("doctrine_version_id_required");
  if (input.effectiveFrom < 0) throw new Error("doctrine_effective_from_invalid");
  return Object.freeze({ ...input });
}
