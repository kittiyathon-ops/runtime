export class SequenceGenerator {
  private current: number;

  constructor(startAt = 0) {
    if (!Number.isInteger(startAt) || startAt < 0) {
      throw new Error("sequence_start_invalid");
    }
    this.current = startAt;
  }

  next(): number {
    this.current += 1;
    return this.current;
  }

  peek(): number {
    return this.current;
  }
}

export class SequenceGuard {
  private lastSeq = 0;
  private readonly seen = new Set<number>();

  accept(seq: number): "ok" | "duplicate" | "out_of_order" {
    if (this.seen.has(seq)) return "duplicate";
    if (seq <= this.lastSeq) return "out_of_order";
    this.seen.add(seq);
    this.lastSeq = seq;
    return "ok";
  }

  checkpoint(): number {
    return this.lastSeq;
  }
}
