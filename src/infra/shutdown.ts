export class ShutdownController {
  private readonly callbacks: Array<() => Promise<void> | void> = [];
  private closed = false;

  onShutdown(callback: () => Promise<void> | void): void {
    this.callbacks.push(callback);
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const callback of this.callbacks) {
      await callback();
    }
  }
}
