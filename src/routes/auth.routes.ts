import { Router } from "express";
import { AuthController } from "@/controllers/auth.controller";
import { AuthService } from "@/services/auth.service";
import { validateRequest } from "@/middleware/validateRequest";
import { loginSchema, signupSchema } from "@/validators/auth.validator";
import { requireAuth } from "@/middleware/authMiddleware";

const router = Router();

// Initialize services and controller
const authService = new AuthService();
const authController = new AuthController(authService);

// Routes
router.post("/signup", validateRequest(signupSchema), authController.signup);
router.post("/login", validateRequest(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);

export default router;
