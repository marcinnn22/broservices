import { Router } from "express";
import { MonitoringController } from "@/controllers/monitoring.controller";

const router = Router();
const monitoringController = new MonitoringController();

router.get("/metrics", monitoringController.getMetrics);
router.get("/health", monitoringController.getHealth);
router.get("/readiness", monitoringController.getReadiness);
router.get("/liveness", monitoringController.getLiveness);

// Add new route for AlertManager webhooks
router.post("/alerts", monitoringController.handleAlert);

export default router;
