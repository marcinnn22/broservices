import { Router } from "express";
import { MonitoringController } from "@/controllers/monitoring.controller";

const router = Router();
const monitoringController = new MonitoringController();

/**
 * @swagger
 * tags:
 *   name: Monitoring
 *   description: System monitoring and health check endpoints
 */

/**
 * @swagger
 * /monitoring/metrics:
 *   get:
 *     summary: Get system metrics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/metrics", monitoringController.getMetrics);

/**
 * @swagger
 * /monitoring/health:
 *   get:
 *     summary: Check system health
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: System health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 memoryUsage:
 *                   type: object
 */
router.get("/health", monitoringController.getHealth);

/**
 * @swagger
 * /monitoring/readiness:
 *   get:
 *     summary: Check if application is ready to handle traffic
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get("/readiness", monitoringController.getReadiness);

/**
 * @swagger
 * /monitoring/liveness:
 *   get:
 *     summary: Check if application is alive
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get("/liveness", monitoringController.getLiveness);

/**
 * @swagger
 * /monitoring/alerts:
 *   post:
 *     summary: Receive alerts from AlertManager
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alerts:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Alert received and processed
 *       401:
 *         description: Unauthorized
 */
router.post("/alerts", monitoringController.handleAlert);

export default router;
