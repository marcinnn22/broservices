import { Router } from "express";
import { UserController } from "@/controllers/user.controller";
import { UserService } from "@/services/user.service";
import { validateRequest } from "@/middleware/validateRequest";
import { requireAuth, requireRole } from "@/middleware/authMiddleware";
import {
  createUserSchema,
  updateUserSchema,
} from "@/validators/user.validator";
import { cache } from "@/middleware/cacheMiddleware";

const router = Router();
const userService = new UserService();
const userController = new UserController(userService);

// Protected routes - all routes require authentication
router.use(requireAuth);

// Admin only routes
router.get(
  "/",
  requireRole(["ADMIN"]),
  cache({ duration: 300 }), // Cache for 5 minutes
  userController.getAll
);
router.get(
  "/:id",
  cache({ duration: 60 }), // Cache for 1 minute
  userController.getUser
);

// Other admin routes
router.post(
  "/",
  requireRole(["ADMIN"]),
  validateRequest(createUserSchema),
  userController.create
);
router.patch(
  "/:id",
  requireRole(["ADMIN"]),
  validateRequest(updateUserSchema),
  userController.update
);
router.delete("/:id", requireRole(["ADMIN"]), userController.delete);

export default router;
