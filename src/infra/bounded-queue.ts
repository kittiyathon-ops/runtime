import { FailClosedError } from "../core/errors.js";

export class BoundedQueue<T> {
  private readonly items: T[] = [];

  constructor(readonly capacity: number, private readonly name: string) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("queue_capacity_invalid");
    }
  }

  push(item: T): void {
    if (this.items.length >= this.capacity) {
      throw new FailClosedError("queue_overflow", `${this.name}:queue_overflow`);
    }
    this.items.push(item);
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }

  drain(maxItems = this.capacity): T[] {
    const drained: T[] = [];
    while (drained.length < maxItems) {
      const item = this.shift();
      if (item === undefined) break;
      drained.push(item);
    }
    return drained;
  }
}
