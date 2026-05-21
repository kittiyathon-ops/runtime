import { identityFingerprint } from "./identity-fingerprint.js";

export interface ContinuityHashInput {
  runtimeId: string;
  genesisHash: string;
  governanceLineageHash: string;
  policyLineageHash: string;
  invariantFingerprint: string;
  doctrineVersionId: string;
}

export function continuityHash(input: ContinuityHashInput): string {
  for (const [key, value] of Object.entries(input)) {
    if (value.length === 0) throw new Error(`continuity_hash_field_required:${key}`);
  }
  return identityFingerprint({
    runtimeId: input.runtimeId,
    genesisHash: input.genesisHash,
    governanceLineageHash: input.governanceLineageHash,
    policyLineageHash: input.policyLineageHash,
    invariantFingerprint: input.invariantFingerprint,
    doctrineVersionId: input.doctrineVersionId
  });
}
