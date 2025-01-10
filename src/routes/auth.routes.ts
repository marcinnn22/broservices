import { Router } from "express";
import { AuthController } from "@/controllers/auth.controller";
import { AuthService } from "@/services/auth.service";
import { validateRequest } from "@/middleware/validateRequest";
import { loginSchema, signupSchema, verifyEmailSchema, resendVerificationSchema, forgotPasswordSchema, resetPasswordSchema } from "@/validators/auth.validator";
import { requireAuth } from "@/middleware/authMiddleware";
import { verificationLimiter } from "@/middleware/rateLimiter";

const router = Router();

// Initialize services and controller
const authService = new AuthService();
const authController = new AuthController(authService);

// Routes
router.post("/signup", validateRequest(signupSchema), authController.signup);
router.post("/login", validateRequest(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.get(
  "/verify-email/:token", 
  validateRequest(verifyEmailSchema),
  authController.verifyEmail
);
router.post(
  "/send-email-verification",
  verificationLimiter,
  validateRequest(resendVerificationSchema),
  authController.resendVerification
);
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  "/reset-password/:token",
  validateRequest(resetPasswordSchema),
  authController.resetPassword
);

export default router;
