export interface ReplayDriftReport {
  status: "ZERO_DRIFT" | "DRIFT_DETECTED";
  expectedSeq: number;
  actualSeq: number;
  drift: number;
}

export class ReplayDriftDetector {
  detect(expectedSeq: number, actualSeq: number): ReplayDriftReport {
    if (expectedSeq < 0 || actualSeq < 0) throw new Error("replay_seq_invalid");
    const drift = actualSeq - expectedSeq;
    return { status: drift === 0 ? "ZERO_DRIFT" : "DRIFT_DETECTED", expectedSeq, actualSeq, drift };
  }
}
