import { createHash } from "node:crypto";

import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { sendError } from "../response.js";

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly limit: number;
  readonly skipSuccessfulRequests?: boolean;
  readonly keyGenerator?: (request: Request) => string;
}

export interface RateLimiters {
  readonly api: RequestHandler;
  readonly login: RequestHandler;
  readonly refresh: RequestHandler;
  readonly publicAuth: RequestHandler;
  readonly monitoring: RequestHandler;
  readonly emailResend: readonly [RequestHandler, RequestHandler];
}

const createLimiter = (options: RateLimitOptions, message: string): RequestHandler =>
  rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    ...(options.keyGenerator === undefined ? {} : { keyGenerator: options.keyGenerator }),
    handler(_request, response): void {
      sendError(response, {
        statusCode: 429,
        code: "RATE_LIMITED",
        message,
      });
    },
  });

const emailRecipientKey = (request: Request): string => {
  const body: unknown = request.body;
  const address = request.ip ?? request.socket.remoteAddress ?? "unknown";
  const clientKey = ipKeyGenerator(address);

  if (typeof body === "object" && body !== null && "email" in body) {
    const email: unknown = body.email;

    if (typeof email === "string" && email.trim().length > 0) {
      const recipientHash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
      return `ip:${clientKey}:email:${recipientHash}`;
    }
  }

  return `ip:${clientKey}`;
};

export function createRateLimiters(options: {
  readonly windowMs: number;
  readonly apiLimit: number;
  readonly loginLimit: number;
  readonly refreshLimit: number;
  readonly publicAuthLimit: number;
  readonly monitoringLimit: number;
  readonly emailResendWindowMs: number;
  readonly emailResendIpLimit: number;
  readonly emailResendRecipientLimit: number;
}): RateLimiters {
  return {
    api: createLimiter(
      {
        windowMs: options.windowMs,
        limit: options.apiLimit,
      },
      "Too many requests. Please try again later.",
    ),
    login: createLimiter(
      {
        windowMs: options.windowMs,
        limit: options.loginLimit,
        skipSuccessfulRequests: true,
      },
      "Too many failed login attempts. Please try again later.",
    ),
    refresh: createLimiter(
      {
        windowMs: options.windowMs,
        limit: options.refreshLimit,
        skipSuccessfulRequests: true,
      },
      "Too many failed session refresh attempts. Please try again later.",
    ),
    publicAuth: createLimiter(
      {
        windowMs: options.windowMs,
        limit: options.publicAuthLimit,
      },
      "Too many authentication requests. Please try again later.",
    ),
    monitoring: createLimiter(
      {
        windowMs: options.windowMs,
        limit: options.monitoringLimit,
      },
      "Too many monitoring requests. Please try again later.",
    ),
    emailResend: [
      createLimiter(
        {
          windowMs: options.emailResendWindowMs,
          limit: options.emailResendIpLimit,
        },
        "Too many verification email requests from this client. Please try again later.",
      ),
      createLimiter(
        {
          windowMs: options.emailResendWindowMs,
          limit: options.emailResendRecipientLimit,
          keyGenerator: emailRecipientKey,
        },
        "Too many verification email requests for this address. Please try again later.",
      ),
    ],
  };
}
