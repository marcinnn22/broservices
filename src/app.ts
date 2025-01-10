import express from "express";
import { ENV } from "@/config/env";
import userRoutes from "@/routes/user.routes";
import authRoutes from "@/routes/auth.routes";
import { errorHandler } from "@/middleware/errorHandler";
import { setupSecurityHeaders } from "@/middleware/securityHeaders";
import { apiLimiter } from "@/middleware/rateLimiter";
import { authLimiter } from "@/middleware/rateLimiter";
import cors from "cors";
import { requestId } from "@/middleware/requestId";
import { loggingMiddleware } from "@/middleware/loggingMiddleware";
import { compressionMiddleware } from "@/middleware/performanceMiddleware";
import { cache } from "@/middleware/cacheMiddleware";
import { metricsMiddleware } from "@/middleware/monitoringMiddleware";
import monitoringRoutes from "@/routes/monitoring.routes";
import { ErrorMonitoringService } from "@/services/errorMonitoring.service";

const app = express();

// Initialize error monitoring
ErrorMonitoringService.getInstance();

// Add request ID middleware early in the chain
app.use(requestId);

// Add logging middleware
app.use(loggingMiddleware);

// Add compression middleware
app.use(compressionMiddleware);

// Add metrics middleware
app.use(metricsMiddleware);

setupSecurityHeaders(app);
app.use(express.json({ limit: "10kb" }));

// CORS
app.use(
  cors({
    origin: ENV.FRONTEND_URL,
    credentials: true,
  })
);

// Rate limiting
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Hello from express-boilerplate Backend! " });
});

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Error Handler
app.use(errorHandler);

// Apply cache middleware to routes that need it
app.use("/api/users", cache({ duration: 300 }));

// Monitoring routes
app.use("/monitoring", monitoringRoutes);

export default app;
