export type ConstitutionalActor = "edge" | "governance" | "recovery" | "runtime" | "observability" | "operator";
export type ConstitutionalAction = "recommend" | "authorize" | "restore" | "execute" | "observe" | "approve" | "mutate_evidence";

const AUTHORITY: Record<ConstitutionalActor, readonly ConstitutionalAction[]> = {
  edge: ["recommend"],
  governance: ["authorize"],
  recovery: ["restore"],
  runtime: ["execute"],
  observability: ["observe"],
  operator: ["approve"]
};

export class AuthorityBoundaries {
  can(actor: ConstitutionalActor, action: ConstitutionalAction): boolean {
    return AUTHORITY[actor].includes(action);
  }

  assert(actor: ConstitutionalActor, action: ConstitutionalAction): void {
    if (!this.can(actor, action)) throw new Error(`constitutional_authority_violation:${actor}:${action}`);
  }
}
