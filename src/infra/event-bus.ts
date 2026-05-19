import type { RuntimeEvent } from "../core/event.js";
import { validateEvent } from "../core/event.js";
import { SequenceGuard } from "../core/sequence.js";
import { BoundedQueue } from "./bounded-queue.js";

export type EventHandler = (event: RuntimeEvent) => Promise<void> | void;

export interface PublishOptions {
  bypassSequenceGuard?: boolean;
}

export class AsyncEventBus {
  private readonly eventHandlers: EventHandler[] = [];
  private readonly safeModeHandlers: EventHandler[] = [];
  private readonly queue: BoundedQueue<RuntimeEvent>;
  private readonly sequenceGuard = new SequenceGuard();
  private readonly idleWaiters: Array<() => void> = [];
  private processing = false;

  constructor(capacity: number) {
    this.queue = new BoundedQueue<RuntimeEvent>(capacity, "event_bus");
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  onSafeMode(handler: EventHandler): void {
    this.safeModeHandlers.push(handler);
  }

  async publish(event: RuntimeEvent, options: PublishOptions = {}): Promise<void> {
    const validated = validateEvent(event);
    if (options.bypassSequenceGuard !== true) {
      const order = this.sequenceGuard.accept(validated.seq);
      if (order !== "ok") {
        throw new Error(`event_sequence_${order}:${validated.seq}`);
      }
    }
    this.queue.push(validated);
    if (this.processing) {
      await this.drain();
      return;
    }
    await this.pump();
  }

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.size() > 0) {
        const event = this.queue.shift();
        if (!event) break;
        if (event.eventType === "SAFE_MODE") {
          for (const handler of this.safeModeHandlers) {
            await handler(event);
          }
        }
        for (const handler of this.eventHandlers) {
          await handler(event);
        }
      }
    } finally {
      this.processing = false;
      this.resolveIdleIfDrained();
    }
  }

  size(): number {
    return this.queue.size();
  }

  drain(): Promise<void> {
    if (!this.processing && this.queue.size() === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private resolveIdleIfDrained(): void {
    if (this.processing || this.queue.size() > 0) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }
}
