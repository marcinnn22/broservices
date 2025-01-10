import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ENV } from "@/config/env";
import { AppError } from "@/utils/appError";
import { logger } from "@/config/logger";
import { ErrorCode } from "@/utils/errorCodes";

const prisma = new PrismaClient();

export class AuthService {
  async signup(email: string, name: string, password: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError("Email already exists", 400, ErrorCode.ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      throw new AppError(
        "Invalid credentials",
        401,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError(
        "Invalid credentials",
        401,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = this.generateRefreshToken(user.id);

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError(
        "Refresh token is required",
        400,
        ErrorCode.INVALID_TOKEN
      );
    }

    try {
      const decoded = jwt.verify(refreshToken, ENV.REFRESH_TOKEN_SECRET) as {
        userId: string;
      };

      logger.debug("Processing refresh token request", {
        userId: decoded.userId,
        context: "AuthService.refresh",
      });

      const user = await prisma.user.findFirst({
        where: {
          id: decoded.userId,
          refreshToken: refreshToken,
        },
      });

      if (!user) {
        throw new AppError(
          "Invalid refresh token",
          401,
          ErrorCode.INVALID_TOKEN
        );
      }

      const accessToken = this.generateAccessToken(user.id, user.role);
      const newRefreshToken = this.generateRefreshToken(user.id);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken },
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      logger.error("Refresh token error", {
        error,
        context: "AuthService.refresh",
      });
      throw new AppError("Invalid refresh token", 401, ErrorCode.INVALID_TOKEN);
    }
  }

  async logout(userId: string) {
    if (!userId) {
      throw new AppError("User ID is required", 400, ErrorCode.INVALID_INPUT);
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
    } catch (error) {
      logger.error("Logout error", {
        error,
        userId,
        context: "AuthService.logout",
      });
      throw new AppError(
        "Failed to logout",
        500,
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }
  }

  private generateAccessToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRY,
    });
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, ENV.REFRESH_TOKEN_SECRET, {
      expiresIn: ENV.REFRESH_TOKEN_EXPIRY,
    });
  }
}
