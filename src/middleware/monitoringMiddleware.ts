import responseTime from "response-time";
import { Request, Response } from "express";
import {
  httpRequestDuration,
  httpRequestTotal
} from "@/config/metrics";

export const metricsMiddleware = responseTime(
  (req: Request, res: Response, time: number) => {
    const route = (req.baseUrl || "") + (req.route?.path || req.path || "/");
    const statusCode = res.statusCode.toString();
    const method = req.method || "UNKNOWN";

    httpRequestDuration
      .labels(method, route, statusCode)
      .observe(time / 1000);

    httpRequestTotal.labels(method, route, statusCode).inc();
  }
);
