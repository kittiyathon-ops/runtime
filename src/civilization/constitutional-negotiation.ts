export function constitutionalNegotiation(parties: readonly string[], agreed: boolean, evidenceIds: string[]) {
  if (parties.length === 0 || evidenceIds.length === 0) throw new Error("constitutional_negotiation_requires_evidence");
  return { status: agreed ? "AGREED" as const : "DEADLOCK" as const, parties: [...parties].sort(), evidenceIds: [...evidenceIds] };
}
