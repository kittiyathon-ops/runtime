export class MonotonicClock {
  private currentValue: number;

  constructor(initial = 0) {
    if (initial < 0) throw new Error("monotonic_clock_initial_invalid");
    this.currentValue = initial;
  }

  now(): number {
    return this.currentValue;
  }

  advance(to: number): number {
    if (to < this.currentValue) throw new Error(`monotonic_clock_regression:${to}<${this.currentValue}`);
    this.currentValue = to;
    return this.currentValue;
  }
}
