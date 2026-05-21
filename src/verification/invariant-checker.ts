export interface InvariantCheck {
  id: string;
  passed: boolean;
  evidenceIds: string[];
  reason: string;
}

export interface InvariantCheckReport {
  status: "PROVEN" | "FAILED";
  checks: InvariantCheck[];
  traceId: string;
}

export class InvariantChecker {
  check(traceId: string, checks: readonly InvariantCheck[]): InvariantCheckReport {
    if (traceId.length === 0) throw new Error("trace_id_required");
    for (const check of checks) {
      if (!check.passed && check.evidenceIds.length === 0) throw new Error(`failed_invariant_requires_evidence:${check.id}`);
    }
    return {
      status: checks.every((check) => check.passed) ? "PROVEN" : "FAILED",
      checks: checks.map((check) => Object.freeze({ ...check })),
      traceId
    };
  }
}
