export interface CausalRecord {
  id: string;
  timestamp: number;
  causationId?: string;
}

export interface CausalityValidationReport {
  status: "VALID" | "CORRUPTED";
  reason?: "temporal_paradox" | "missing_cause";
  id?: string;
  traceId: string;
  evidenceIds: string[];
}

export class CausalityValidator {
  validate(records: readonly CausalRecord[], traceId: string): CausalityValidationReport {
    if (traceId.length === 0) throw new Error("trace_id_required");
    const byId = new Map(records.map((record) => [record.id, record]));
    let previous = -1;
    for (const record of records) {
      if (record.timestamp < previous) {
        return { status: "CORRUPTED", reason: "temporal_paradox", id: record.id, traceId, evidenceIds: [`causal:${record.id}`] };
      }
      if (record.causationId !== undefined) {
        const cause = byId.get(record.causationId);
        if (cause === undefined || cause.timestamp > record.timestamp) {
          return { status: "CORRUPTED", reason: "missing_cause", id: record.id, traceId, evidenceIds: [`causal:${record.id}`] };
        }
      }
      previous = record.timestamp;
    }
    return { status: "VALID", traceId, evidenceIds: [] };
  }
}
