import { identityFingerprint } from "./identity-fingerprint.js";

export interface InvariantFingerprintInput {
  invariantIds: readonly string[];
  doctrineVersionId: string;
}

export function invariantFingerprint(input: InvariantFingerprintInput): string {
  if (input.doctrineVersionId.length === 0) throw new Error("doctrine_version_id_required");
  if (input.invariantIds.length === 0) throw new Error("invariant_fingerprint_requires_invariants");
  return identityFingerprint({
    doctrineVersionId: input.doctrineVersionId,
    invariantIds: [...input.invariantIds].sort()
  });
}
