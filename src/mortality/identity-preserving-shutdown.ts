export class IdentityPreservingShutdown {
  private readonly lineage: Array<{ seq: number; runtimeId: string; continuityHash: string; governanceLineageId: string; evidenceIds: string[] }> = [];

  append(runtimeId: string, continuityHash: string, governanceLineageId: string, evidenceIds: string[]) {
    if (runtimeId.length === 0 || continuityHash.length === 0 || governanceLineageId.length === 0 || evidenceIds.length === 0) {
      throw new Error("identity_shutdown_requires_evidence");
    }
    const record = Object.freeze({
      seq: this.lineage.length + 1,
      runtimeId,
      continuityHash,
      governanceLineageId,
      evidenceIds: [...evidenceIds]
    });
    this.lineage.push(record);
    return record;
  }

  terminalIdentity() {
    return this.lineage.at(-1);
  }

  all() {
    return this.lineage;
  }
}
