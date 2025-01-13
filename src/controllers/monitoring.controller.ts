import { Request, Response, NextFunction } from "express";
import { register } from "@/config/metrics";
import { BaseController } from "./base.controller";

export class MonitoringController extends BaseController {
  getMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      const metrics = await register.metrics();
      res.set("Content-Type", register.contentType);
      return metrics;
    });
  };

  getHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      return {
        status: "ok",
        timestamp: new Date(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      };
    });
  };

  getReadiness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      return { status: "ok" };
    });
  };

  getLiveness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      return { status: "ok" };
    });
  };

  handleAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      const alerts = req.body;

      return {
        status: "success",
        message: "Alert received and processed"
      };
    });
  };
}
