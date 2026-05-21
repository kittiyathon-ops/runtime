export interface StateTransitionRule<TState extends string> {
  from: TState;
  to: TState;
}

export interface VerifiedTransition<TState extends string> {
  from: TState;
  to: TState;
  legal: boolean;
  traceId: string;
  evidenceIds: string[];
}

export class StateMachineVerifier<TState extends string> {
  constructor(private readonly rules: readonly StateTransitionRule<TState>[]) {}

  verify(from: TState, to: TState, traceId: string, evidenceIds: string[]): VerifiedTransition<TState> {
    if (traceId.length === 0) throw new Error("trace_id_required");
    const legal = from === to || this.rules.some((rule) => rule.from === from && rule.to === to);
    if (!legal && evidenceIds.length === 0) throw new Error("illegal_transition_requires_evidence");
    return Object.freeze({ from, to, legal, traceId, evidenceIds });
  }
}
