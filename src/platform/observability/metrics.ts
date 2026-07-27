import { constants, PerformanceObserver } from "node:perf_hooks";

import client from "prom-client";

export interface MetricsOptions {
  readonly serviceName: string;
  readonly collectDefaultMetrics?: boolean;
}

export interface HttpMetric {
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
  readonly durationSeconds: number;
}

export interface DatabaseMetric {
  readonly operation: string;
  readonly table: string;
  readonly success: boolean;
  readonly durationSeconds: number;
}

export interface ApplicationMetrics {
  readonly registry: client.Registry;
  readonly contentType: string;
  metrics(): Promise<string>;
  startHttpRequest(method: string): void;
  finishHttpRequest(metric: HttpMetric): void;
  recordDatabaseQuery(metric: DatabaseMetric): void;
  close(): void;
}

interface GarbageCollectionEntry extends PerformanceEntry {
  readonly detail?: {
    readonly kind?: number;
  };
}

const normalizeMethod = (method: string): string => {
  const normalized = method.toUpperCase();
  return /^[A-Z]{1,16}$/.test(normalized) ? normalized : "OTHER";
};

const boundedLabel = (value: string): string => {
  const normalized = value.trim().slice(0, 128);
  return normalized.length > 0 ? normalized : "unknown";
};

const gcType = (kind: number | undefined): string => {
  switch (kind) {
    case constants.NODE_PERFORMANCE_GC_MINOR:
      return "minor";
    case constants.NODE_PERFORMANCE_GC_MAJOR:
      return "major";
    case constants.NODE_PERFORMANCE_GC_INCREMENTAL:
      return "incremental";
    case constants.NODE_PERFORMANCE_GC_WEAKCB:
      return "weak_callback";
    default:
      return "unknown";
  }
};

export function createMetrics(options: MetricsOptions): ApplicationMetrics {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: options.serviceName });

  if (options.collectDefaultMetrics !== false) {
    client.collectDefaultMetrics({
      register: registry,
      prefix: "node_",
    });
  }

  const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const httpRequests = new client.Counter({
    name: "http_requests_total",
    help: "Total number of completed HTTP requests.",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [registry],
  });

  const httpErrors = new client.Counter({
    name: "http_errors_total",
    help: "Total number of completed HTTP requests with a 4xx or 5xx status.",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [registry],
  });

  const httpRequestsInFlight = new client.Gauge({
    name: "http_requests_in_flight",
    help: "Number of HTTP requests currently being processed.",
    labelNames: ["method"] as const,
    registers: [registry],
  });

  const databaseQueryDuration = new client.Histogram({
    name: "database_query_duration_seconds",
    help: "Database query duration in seconds.",
    labelNames: ["operation", "table", "success"] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const nodeProcessStats = new client.Gauge({
    name: "node_process_stats",
    help: "Compatibility process statistics gauge.",
    labelNames: ["stat"] as const,
    registers: [registry],
    collect(): void {
      const memory = process.memoryUsage();
      this.set({ stat: "heap_used" }, memory.heapUsed);
      this.set({ stat: "heap_total" }, memory.heapTotal);
      this.set({ stat: "rss" }, memory.rss);
      this.set({ stat: "external" }, memory.external);

      const cpu = process.cpuUsage();
      this.set({ stat: "cpu_user" }, cpu.user);
      this.set({ stat: "cpu_system" }, cpu.system);
    },
  });

  const gcDuration = new client.Histogram({
    name: "node_gc_duration_seconds",
    help: "Garbage collection duration in seconds by collection type.",
    labelNames: ["gc_type"] as const,
    buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [registry],
  });

  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as GarbageCollectionEntry[]) {
      gcDuration.observe({ gc_type: gcType(entry.detail?.kind) }, entry.duration / 1_000);
    }
  });

  try {
    gcObserver.observe({ entryTypes: ["gc"] });
  } catch {
    // Default Node.js metrics remain available if this runtime has no GC entries.
  }

  let closed = false;

  return {
    registry,
    contentType: registry.contentType,

    metrics(): Promise<string> {
      return registry.metrics();
    },

    startHttpRequest(method: string): void {
      if (closed) {
        return;
      }

      httpRequestsInFlight.inc({ method: normalizeMethod(method) });
    },

    finishHttpRequest(metric: HttpMetric): void {
      if (closed) {
        return;
      }

      const labels = {
        method: normalizeMethod(metric.method),
        route: boundedLabel(metric.route),
        status_code: String(metric.statusCode),
      };

      httpRequestsInFlight.dec({ method: labels.method });
      httpRequests.inc(labels);
      httpRequestDuration.observe(labels, Math.max(0, metric.durationSeconds));

      if (metric.statusCode >= 400) {
        httpErrors.inc(labels);
      }
    },

    recordDatabaseQuery(metric: DatabaseMetric): void {
      if (closed) {
        return;
      }

      databaseQueryDuration.observe(
        {
          operation: boundedLabel(metric.operation).toLowerCase(),
          table: boundedLabel(metric.table).toLowerCase(),
          success: String(metric.success),
        },
        Math.max(0, metric.durationSeconds),
      );
    },

    close(): void {
      if (closed) {
        return;
      }

      closed = true;
      gcObserver.disconnect();
      registry.clear();
      void nodeProcessStats;
    },
  };
}
