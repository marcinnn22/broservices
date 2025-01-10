import { Request, Response } from "express";
import { register } from "@/services/metrics.service";
import { ApiResponse } from "@/utils/apiResponse";
import os from "os";

export class MonitoringController {
  async getMetrics(_req: Request, res: Response) {
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  }

  async getHealth(_req: Request, res: Response) {
    const healthInfo = {
      status: "ok",
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: {
        load: os.loadavg(),
        cores: os.cpus().length,
      },
      platform: {
        node: process.version,
        os: `${os.type()} ${os.release()}`,
      },
    };

    ApiResponse.success(res, "Health check successful", healthInfo);
  }

  async getReadiness(_req: Request, res: Response) {
    // Add your readiness checks here (e.g., database connection)
    ApiResponse.success(res, "Service is ready");
  }

  async getLiveness(_req: Request, res: Response) {
    // Basic check if the service is running
    ApiResponse.success(res, "Service is alive");
  }
}
