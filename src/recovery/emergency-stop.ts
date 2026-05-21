export interface EmergencyStopRecord {
  timestamp: number;
  traceId: string;
  reason: string;
  evidenceIds: string[];
  state: "ARMED" | "TRIGGERED";
}

export class EmergencyStop {
  private record?: EmergencyStopRecord;

  trigger(timestamp: number, traceId: string, reason: string, evidenceIds: string[]): EmergencyStopRecord {
    if (traceId.length === 0) throw new Error("trace_id_required");
    if (evidenceIds.length === 0) throw new Error("emergency_stop_requires_evidence");
    this.record = Object.freeze({ timestamp, traceId, reason, evidenceIds, state: "TRIGGERED" as const });
    return this.record;
  }

  current(): EmergencyStopRecord {
    return this.record ?? { timestamp: 0, traceId: "unarmed", reason: "not_triggered", evidenceIds: [], state: "ARMED" };
  }
}
