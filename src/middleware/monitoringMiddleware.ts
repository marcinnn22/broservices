import responseTime from "response-time";
import { Request, Response } from "express";
import {
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
} from "@/services/metrics.service";

export const metricsMiddleware = responseTime(
  (req: Request, res: Response, time: number) => {
    const route = (req.baseUrl || "") + (req.route?.path || req.path || "/");
    const statusCode = res.statusCode.toString();
    const method = req.method || "UNKNOWN";

    httpRequestDurationMicroseconds
      .labels(method, route, statusCode)
      .observe(time / 1000);

    httpRequestsTotal.labels(method, route, statusCode).inc();
  }
);
