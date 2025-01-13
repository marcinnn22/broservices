import client from "prom-client";
import { logger } from "@/config/logger";
import { singleton } from "@/decorators/singleton";

@singleton
export class MetricsService {
  private register!: client.Registry;
  private httpRequestDuration!: client.Histogram;
  private httpRequestTotal!: client.Counter;
  private activeUsers!: client.Gauge;
  private dbQueryDuration!: client.Histogram;
  private websocketConnections!: client.Gauge;
  private websocketMessages!: client.Counter;
  private apiLatencyPercentiles!: client.Summary;
  private circuitBreakerState!: client.Gauge;

  constructor() {
    this.register = new client.Registry();
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    try {
      // Initialize default metrics with error handling
      client.collectDefaultMetrics({
        register: this.register,
        prefix: 'node_',
        labels: { service: 'express-api' },
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
      });

      // Initialize custom metrics
      this.initializeHttpMetrics();
      this.initializeBusinessMetrics();
      this.initializeDatabaseMetrics();
      this.initializeWebsocketMetrics();
      this.initializeSystemMetrics();
    } catch (error) {
      logger.error('Failed to initialize metrics', { error });
      throw error;
    }
  }

  private initializeHttpMetrics(): void {
    this.httpRequestDuration = new client.Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [this.register]
    });

    this.httpRequestTotal = new client.Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.register]
    });

    this.apiLatencyPercentiles = new client.Summary({
      name: 'http_request_duration_percentiles',
      help: 'HTTP request latency percentiles',
      percentiles: [0.5, 0.9, 0.95, 0.99],
      labelNames: ['method', 'route'],
      registers: [this.register]
    });
  }

  private initializeBusinessMetrics(): void {
    this.activeUsers = new client.Gauge({
      name: "active_users_total",
      help: "Number of active users",
      registers: [this.register]
    });
  }

  private initializeDatabaseMetrics(): void {
    this.dbQueryDuration = new client.Histogram({
      name: "db_query_duration_seconds",
      help: "Duration of database queries in seconds",
      labelNames: ["operation", "table", "success"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.register]
    });
  }

  private initializeWebsocketMetrics(): void {
    this.websocketConnections = new client.Gauge({
      name: "websocket_connections_total",
      help: "Number of active WebSocket connections",
      registers: [this.register]
    });

    this.websocketMessages = new client.Counter({
      name: "websocket_messages_total",
      help: "Total number of WebSocket messages",
      labelNames: ["type", "direction"],
      registers: [this.register]
    });
  }

  private initializeSystemMetrics(): void {
    this.circuitBreakerState = new client.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0: closed, 1: open, 0.5: half-open)',
      labelNames: ['service'],
      registers: [this.register]
    });
  }

  // Public methods for recording metrics
  public recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const labels = { method, route, status_code: statusCode.toString() };
    this.httpRequestDuration.observe(labels, duration);
    this.httpRequestTotal.inc(labels);
    this.apiLatencyPercentiles.observe({ method, route }, duration);
  }

  public recordDbQuery(operation: string, table: string, duration: number, success: boolean): void {
    this.dbQueryDuration.observe(
      { operation, table, success: success.toString() },
      duration
    );
  }

  public updateActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  public recordWebsocketConnection(isConnect: boolean): void {
    if (isConnect) {
      this.websocketConnections.inc();
    } else {
      this.websocketConnections.dec();
    }
  }

  public recordWebsocketMessage(type: string, direction: 'in' | 'out'): void {
    this.websocketMessages.inc({ type, direction });
  }

  public updateCircuitBreakerState(service: string, state: 'closed' | 'open' | 'half-open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 0.5;
    this.circuitBreakerState.set({ service }, stateValue);
  }

  public async getMetrics(): Promise<string> {
    try {
      return await this.register.metrics();
    } catch (error) {
      logger.error('Error generating metrics', { error });
      throw error;
    }
  }

  public getContentType(): string {
    return this.register.contentType;
  }
}
