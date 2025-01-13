import client from "prom-client";

// Create a Registry to store metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// API metrics
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Business metrics
export const activeUsers = new client.Gauge({
  name: "active_users",
  help: "Number of active users",
});

// Database metrics
export const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "success"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// WebSocket metrics
export const websocketConnections = new client.Gauge({
  name: "websocket_connections_total",
  help: "Total number of active WebSocket connections",
});

export const websocketMessages = new client.Counter({
  name: "websocket_messages_total",
  help: "Total number of WebSocket messages",
  labelNames: ["type"],
});

// Add more business metrics
export const apiLatencyPercentiles = new client.Summary({
  name: 'http_request_duration_percentiles',
  help: 'HTTP request latency percentiles',
  percentiles: [0.5, 0.9, 0.95, 0.99],
  labelNames: ['method', 'route']
});

// Add circuit breaker metrics
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0: closed, 1: open, 0.5: half-open)',
  labelNames: ['service']
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeUsers);
register.registerMetric(dbQueryDuration);
register.registerMetric(websocketConnections);
register.registerMetric(websocketMessages);

export { register }; 