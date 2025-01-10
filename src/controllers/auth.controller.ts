import { Request, Response } from "express";
import { AuthService } from "@/services/auth.service";
import { ApiResponse } from "@/utils/apiResponse";
import { ErrorHandler } from "@/utils/errorHandler";
import { logger } from "@/config/logger";
import { AppError } from "@/utils/appError";

export class AuthController {
  constructor(private authService: AuthService) {}

  signup = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, name, password } = req.body;

      logger.info({
        message: "Signup attempt",
        context: "AuthController.signup",
        email,
      });

      const user = await this.authService.signup(email, name, password);

      logger.info({
        message: "Signup successful",
        context: "AuthController.signup",
        userId: user.id,
      });

      ApiResponse.success(res, "Account created successfully", user);
    } catch (error) {
      const handledError = ErrorHandler.handle(error, "AuthController.signup");
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      logger.info({
        message: "Login attempt",
        context: "AuthController.login",
        email,
      });

      const result = await this.authService.login(email, password);

      logger.info({
        message: "Login successful",
        context: "AuthController.login",
        userId: result.user.id,
      });

      ApiResponse.success(res, "Login successful", result);
    } catch (error) {
      const handledError = ErrorHandler.handle(error, "AuthController.login");
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const result = await this.authService.refresh(refreshToken);
      ApiResponse.success(res, "Token refreshed successfully", result);
    } catch (error) {
      const handledError = ErrorHandler.handle(error, "AuthController.refresh");
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        throw new AppError("Unauthorized", 401);
      }

      logger.info({
        message: "Logout attempt",
        context: "AuthController.logout",
        userId: req.user.userId,
      });

      await this.authService.logout(req.user.userId);

      logger.info({
        message: "Logout successful",
        context: "AuthController.logout",
        userId: req.user.userId,
      });

      ApiResponse.success(res, "Logged out successfully");
    } catch (error) {
      const handledError = ErrorHandler.handle(error, "AuthController.logout");
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const result = await this.authService.verifyEmail(token);
      ApiResponse.success(res, "Email verified successfully", result);
    } catch (error) {
      const handledError = ErrorHandler.handle(error, "AuthController.verifyEmail");
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };

  resendVerification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      const result = await this.authService.resendVerificationEmail(email);
      ApiResponse.success(res, "Verification email sent", result);
    } catch (error) {
      const handledError = ErrorHandler.handle(
        error,
        "AuthController.resendVerification"
      );
      ApiResponse.error(
        res,
        handledError.message,
        handledError.statusCode,
        handledError.code
      );
    }
  };
}
