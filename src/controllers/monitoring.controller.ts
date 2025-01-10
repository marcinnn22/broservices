import { Request, Response } from "express";
import { register, collectDefaultMetrics } from "prom-client";
import { logger } from "@/config/logger";

export class MonitoringController {
  constructor() {
    // Initialize default metrics collection
    collectDefaultMetrics();
  }

  getMetrics = async (req: Request, res: Response) => {
    try {
      const metrics = await register.metrics();
      res.set("Content-Type", register.contentType);
      res.send(metrics);
    } catch (error) {
      res.status(500).send(error);
    }
  };

  getHealth = (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  };

  getReadiness = (req: Request, res: Response) => {
    res.json({ status: "ok" });
  };

  getLiveness = (req: Request, res: Response) => {
    res.json({ status: "ok" });
  };

  // New method to handle AlertManager webhooks
  handleAlert = (req: Request, res: Response) => {
    try {
      const alerts = req.body;
      
      // Log the received alerts
      logger.info("Received alert from AlertManager", {
        context: "AlertManager",
        alerts: alerts
      });

      // Here you can add your own alert handling logic
      // For example: sending to a chat system, creating tickets, etc.

      res.status(200).json({
        status: "success",
        message: "Alert received and processed"
      });
    } catch (error) {
      logger.error("Error processing alert", {
        context: "AlertManager",
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      res.status(500).json({
        status: "error",
        message: "Failed to process alert"
      });
    }
  };
}
