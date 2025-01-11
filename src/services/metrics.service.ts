import client from "prom-client";

// Create a Registry to store metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// HTTP request duration metric
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5],
});

// HTTP request total metric
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Error rate metric
export const errorRate = new client.Counter({
  name: "error_rate_total",
  help: "Total number of errors",
  labelNames: ["type", "code"],
});

// Active users metric
export const activeUsers = new client.Gauge({
  name: "active_users",
  help: "Number of active users",
});

// Database query duration
export const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.1, 0.5, 1, 2, 5],
});

// Add new WebSocket metrics
export const websocketConnections = new client.Gauge({
  name: 'websocket_connections_total',
  help: 'Number of active WebSocket connections'
});

export const websocketMessages = new client.Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestsTotal);
register.registerMetric(errorRate);
register.registerMetric(activeUsers);
register.registerMetric(dbQueryDuration);
register.registerMetric(websocketConnections);
register.registerMetric(websocketMessages);

export { register };
