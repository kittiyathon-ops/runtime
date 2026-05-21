export interface ReplayStateDigest {
  seq: number;
  digest: string;
}

export interface ReplayConsistencyReport {
  status: "CONSISTENT" | "DIVERGENT";
  divergenceSeq?: number;
  traceId: string;
  evidenceIds: string[];
}

export class ReplayConsistencyVerifier {
  verify(expected: readonly ReplayStateDigest[], actual: readonly ReplayStateDigest[], traceId: string): ReplayConsistencyReport {
    if (traceId.length === 0) throw new Error("trace_id_required");
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      const left = expected[index];
      const right = actual[index];
      if (left?.seq !== right?.seq || left?.digest !== right?.digest) {
        const divergenceSeq = left?.seq ?? right?.seq ?? 0;
        return { status: "DIVERGENT", divergenceSeq, traceId, evidenceIds: [`replay:${divergenceSeq}`] };
      }
    }
    return { status: "CONSISTENT", traceId, evidenceIds: [] };
  }
}
