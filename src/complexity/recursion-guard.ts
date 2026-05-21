import { RecursionDetector, type RecursionReport } from "./recursion-detector.js";

export interface RecursionGuardReport extends RecursionReport {
  action: "ALLOW" | "CONTAIN";
}

export class RecursionGuard {
  evaluate(path: readonly string[]): RecursionGuardReport {
    const report = new RecursionDetector().detect(path);
    return {
      ...report,
      action: report.status === "RECURSION_DETECTED" ? "CONTAIN" : "ALLOW"
    };
  }
}
