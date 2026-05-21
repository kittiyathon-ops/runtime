export function doubtTrustFragmentation(fragmentCount: number, maxFragments: number, evidenceIds: string[]) {
  if (fragmentCount < 0 || maxFragments < 0 || evidenceIds.length === 0) throw new Error("doubt_trust_fragmentation_requires_evidence");
  return { status: fragmentCount > maxFragments ? "TRUST_FRAGMENTED" as const : "TRUST_BOUNDED" as const, fragmentCount, maxFragments, evidenceIds: [...evidenceIds] };
}
