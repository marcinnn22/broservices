import { Request, Response, NextFunction } from "express";
import { MetricsService } from "@/services/metrics.service";
import responseTime from "response-time";
import { logger } from "@/config/logger";

const metricsService = new MetricsService();

export const metricsMiddleware = responseTime((req: Request, res: Response, time: number) => {
  try {
    const route = req.route?.path || req.path || "/unknown";
    
    // Skip metrics endpoint to avoid recursion
    if (route.startsWith('/monitoring/metrics')) {
      return;
    }

    metricsService.recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      time / 1000
    );
  } catch (error) {
    logger.error('Error recording metrics', { error });
  }
});
