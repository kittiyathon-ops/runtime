import { z } from "zod";

export const TraceContextSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).optional()
});

export type TraceContext = z.infer<typeof TraceContextSchema>;

export const TracingSpanSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).optional(),
  name: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  attributes: z.record(z.string(), z.unknown())
}).refine((span) => span.endedAt === undefined || span.endedAt >= span.startedAt, "span_timeline_inconsistent");

export type TracingSpan = z.infer<typeof TracingSpanSchema>;

export class TracingSpanRecorder {
  private readonly spans: TracingSpan[] = [];

  start(context: TraceContext, name: string, startedAt: number, attributes: Record<string, unknown> = {}): TracingSpan {
    const span = Object.freeze(TracingSpanSchema.parse({
      ...context,
      name,
      startedAt,
      attributes
    }));
    this.spans.push(span);
    return span;
  }

  end(spanId: string, endedAt: number, attributes: Record<string, unknown> = {}): TracingSpan {
    const span = this.spans.find((entry) => entry.spanId === spanId);
    if (span === undefined) throw new Error(`span_not_found:${spanId}`);
    const ended = Object.freeze(TracingSpanSchema.parse({
      ...span,
      endedAt,
      attributes: { ...span.attributes, ...attributes }
    }));
    this.spans.push(ended);
    return ended;
  }

  all(): readonly TracingSpan[] {
    return this.spans;
  }
}
