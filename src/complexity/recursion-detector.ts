export interface RecursionReport {
  status: "FINITE" | "RECURSION_DETECTED";
  repeatedNode?: string;
}

export class RecursionDetector {
  detect(path: readonly string[]): RecursionReport {
    const seen = new Set<string>();
    for (const node of path) {
      if (seen.has(node)) return { status: "RECURSION_DETECTED", repeatedNode: node };
      seen.add(node);
    }
    return { status: "FINITE" };
  }
}
