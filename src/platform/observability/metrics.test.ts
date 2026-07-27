import { afterEach, describe, expect, it } from "vitest";

import { type ApplicationMetrics, createMetrics } from "./metrics.js";

const openMetrics: ApplicationMetrics[] = [];

afterEach(() => {
  for (const metrics of openMetrics.splice(0)) {
    metrics.close();
  }
});

describe("createMetrics", () => {
  it("records bounded HTTP and database metric contracts", async () => {
    const metrics = createMetrics({
      serviceName: "test-api",
      collectDefaultMetrics: false,
    });
    openMetrics.push(metrics);

    metrics.startHttpRequest("get");
    metrics.finishHttpRequest({
      method: "get",
      route: "/users/:id",
      statusCode: 404,
      durationSeconds: 0.025,
    });
    metrics.recordDatabaseQuery({
      operation: "select",
      table: "users",
      success: true,
      durationSeconds: 0.005,
    });

    const exposition = await metrics.metrics();

    expect(exposition).toContain(
      'http_requests_total{method="GET",route="/users/:id",status_code="404",service="test-api"} 1',
    );
    expect(exposition).toContain(
      'http_errors_total{method="GET",route="/users/:id",status_code="404",service="test-api"} 1',
    );
    expect(exposition).toContain(
      'database_query_duration_seconds_count{service="test-api",operation="select",table="users",success="true"} 1',
    );
  });
});
