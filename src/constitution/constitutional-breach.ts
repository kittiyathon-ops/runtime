import type { ConstitutionalInvariantId } from "./constitutional-invariants.js";

export interface ConstitutionalEvidence {
  evidenceId: string;
  timestamp: number;
  traceId: string;
  source: string;
}

export interface ConstitutionalBreach {
  breachId: string;
  invariantId: ConstitutionalInvariantId;
  timestamp: number;
  traceId: string;
  severity: "CRITICAL" | "FATAL";
  reason: string;
  evidence: ConstitutionalEvidence[];
  failClosed: true;
}

export function constitutionalBreach(input: Omit<ConstitutionalBreach, "failClosed">): ConstitutionalBreach {
  if (input.evidence.length === 0) throw new Error("constitutional_breach_requires_evidence");
  if (input.traceId.length === 0) throw new Error("trace_id_required");
  return Object.freeze({ ...input, failClosed: true as const });
}
