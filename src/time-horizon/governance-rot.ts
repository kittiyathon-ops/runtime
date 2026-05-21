export function governanceRot(decisionInstability: number, maxInstability: number, evidenceIds: string[]) {
  if (decisionInstability < 0 || maxInstability < 0 || evidenceIds.length === 0) throw new Error("governance_rot_requires_evidence");
  return { status: decisionInstability <= maxInstability ? "GOVERNANCE_STABLE_LONG_HORIZON" as const : "GOVERNANCE_ROT_DETECTED" as const, evidenceIds: [...evidenceIds] };
}
