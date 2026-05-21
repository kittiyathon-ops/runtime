export type MetricValue = number;

export interface CounterSnapshot {
  type: "counter";
  value: number;
}

export interface GaugeSnapshot {
  type: "gauge";
  value: number;
}

export interface HistogramSnapshot {
  type: "histogram";
  count: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
  latest: number;
}

export type MetricSnapshot = CounterSnapshot | GaugeSnapshot | HistogramSnapshot;

export interface MetricsSnapshot {
  counters: Record<string, CounterSnapshot>;
  gauges: Record<string, GaugeSnapshot>;
  histograms: Record<string, HistogramSnapshot>;
}

class Counter {
  private value = 0;

  increment(by = 1): void {
    if (!Number.isFinite(by) || by < 0) throw new Error("counter_increment_invalid");
    this.value += by;
  }

  snapshot(): CounterSnapshot {
    return { type: "counter", value: this.value };
  }
}

class Gauge {
  private value = 0;

  set(value: number): void {
    if (!Number.isFinite(value)) throw new Error("gauge_value_invalid");
    this.value = value;
  }

  snapshot(): GaugeSnapshot {
    return { type: "gauge", value: this.value };
  }
}

class Histogram {
  private count = 0;
  private min = Number.POSITIVE_INFINITY;
  private max = Number.NEGATIVE_INFINITY;
  private sum = 0;
  private latest = 0;

  observe(value: number): void {
    if (!Number.isFinite(value)) throw new Error("histogram_value_invalid");
    this.count += 1;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.sum += value;
    this.latest = value;
  }

  snapshot(): HistogramSnapshot {
    return {
      type: "histogram",
      count: this.count,
      min: this.count === 0 ? 0 : this.min,
      max: this.count === 0 ? 0 : this.max,
      sum: this.sum,
      avg: this.count === 0 ? 0 : this.sum / this.count,
      latest: this.latest
    };
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();
  private readonly histograms = new Map<string, Histogram>();

  incrementCounter(name: string, by = 1): void {
    this.counter(name).increment(by);
  }

  setGauge(name: string, value: number): void {
    this.gauge(name).set(value);
  }

  observeHistogram(name: string, value: number): void {
    this.histogram(name).observe(value);
  }

  snapshot(): MetricsSnapshot {
    return {
      counters: Object.fromEntries(Array.from(this.counters.entries()).map(([name, metric]) => [name, metric.snapshot()])),
      gauges: Object.fromEntries(Array.from(this.gauges.entries()).map(([name, metric]) => [name, metric.snapshot()])),
      histograms: Object.fromEntries(Array.from(this.histograms.entries()).map(([name, metric]) => [name, metric.snapshot()]))
    };
  }

  private counter(name: string): Counter {
    this.assertName(name);
    let metric = this.counters.get(name);
    if (metric === undefined) {
      metric = new Counter();
      this.counters.set(name, metric);
    }
    return metric;
  }

  private gauge(name: string): Gauge {
    this.assertName(name);
    let metric = this.gauges.get(name);
    if (metric === undefined) {
      metric = new Gauge();
      this.gauges.set(name, metric);
    }
    return metric;
  }

  private histogram(name: string): Histogram {
    this.assertName(name);
    let metric = this.histograms.get(name);
    if (metric === undefined) {
      metric = new Histogram();
      this.histograms.set(name, metric);
    }
    return metric;
  }

  private assertName(name: string): void {
    if (name.length === 0) throw new Error("metric_name_required");
  }
}
