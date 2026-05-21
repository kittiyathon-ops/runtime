import type { RuntimeIdentity } from "./runtime-identity.js";

export interface IdentityAttestation {
  attestationId: string;
  timestamp: number;
  traceId: string;
  runtimeIdentity: RuntimeIdentity;
  evidenceIds: string[];
  status: "ATTESTED" | "REJECTED";
}

export class IdentityAttestor {
  attest(input: Omit<IdentityAttestation, "status">): IdentityAttestation {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.evidenceIds.length === 0) throw new Error("identity_attestation_requires_evidence");
    return Object.freeze({
      ...input,
      evidenceIds: [...input.evidenceIds],
      status: input.runtimeIdentity.identityDriftScore === 0 ? "ATTESTED" : "REJECTED"
    });
  }
}
