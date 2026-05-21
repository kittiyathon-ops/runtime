export interface RuntimeInspectionInput {
  traceId: string;
  subjectId: string;
  evidenceIds: string[];
  runtimeState: Record<string, unknown>;
}

export interface RuntimeInspectionView {
  traceId: string;
  subjectId: string;
  evidenceIds: string[];
  runtimeState: Record<string, unknown>;
  replayConsistent: true;
}

export class RuntimeInspection {
  inspect(input: RuntimeInspectionInput): RuntimeInspectionView {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.evidenceIds.length === 0) throw new Error("inspection_requires_evidence");
    return Object.freeze({ ...input, runtimeState: Object.freeze({ ...input.runtimeState }), replayConsistent: true as const });
  }
}
