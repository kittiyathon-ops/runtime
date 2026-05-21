import { continuityHash } from "./continuity-hash.js";

export interface RuntimeIdentity {
  runtimeId: string;
  genesisHash: string;
  governanceLineageHash: string;
  policyLineageHash: string;
  invariantFingerprint: string;
  doctrineVersionId: string;
  continuityHash: string;
  operationalIdentityScore: number;
  identityDriftScore: number;
}

export interface RuntimeIdentityInput extends Omit<RuntimeIdentity, "continuityHash" | "operationalIdentityScore" | "identityDriftScore"> {
  previousContinuityHash?: string;
}

export function runtimeIdentity(input: RuntimeIdentityInput): RuntimeIdentity {
  const hash = continuityHash(input);
  const drift = input.previousContinuityHash === undefined || input.previousContinuityHash === hash ? 0 : 1;
  return Object.freeze({
    ...input,
    continuityHash: hash,
    operationalIdentityScore: 1 - drift,
    identityDriftScore: drift
  });
}
