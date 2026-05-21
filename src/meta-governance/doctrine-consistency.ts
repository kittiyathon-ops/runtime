export interface DoctrineConsistencyReport {
  status: "CONSISTENT" | "INCONSISTENT";
  conflicts: string[];
  evidenceIds: string[];
}

export class DoctrineConsistency {
  evaluate(requiredInvariants: readonly string[], activeInvariants: readonly string[], evidenceIds: string[]): DoctrineConsistencyReport {
    if (requiredInvariants.length === 0) throw new Error("required_invariants_missing");
    const active = new Set(activeInvariants);
    const conflicts = requiredInvariants.filter((invariant) => !active.has(invariant));
    if (conflicts.length > 0 && evidenceIds.length === 0) throw new Error("doctrine_conflict_requires_evidence");
    return { status: conflicts.length === 0 ? "CONSISTENT" : "INCONSISTENT", conflicts, evidenceIds: [...evidenceIds] };
  }
}
