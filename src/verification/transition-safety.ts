export interface TransitionSafetyInput {
  from: string;
  to: string;
  governanceAuthorized: boolean;
  rollbackSafe: boolean;
  replayConsistent: boolean;
  traceId: string;
  evidenceIds: string[];
}

export interface TransitionSafetyReport {
  status: "SAFE" | "UNSAFE";
  reasons: string[];
  traceId: string;
  evidenceIds: string[];
}

export class TransitionSafetyVerifier {
  verify(input: TransitionSafetyInput): TransitionSafetyReport {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    const reasons: string[] = [];
    if (!input.governanceAuthorized) reasons.push("governance_bypass");
    if (!input.rollbackSafe) reasons.push("rollback_unsafe");
    if (!input.replayConsistent) reasons.push("replay_divergence");
    if (reasons.length > 0 && input.evidenceIds.length === 0) throw new Error("unsafe_transition_requires_evidence");
    return { status: reasons.length === 0 ? "SAFE" : "UNSAFE", reasons, traceId: input.traceId, evidenceIds: input.evidenceIds };
  }
}
