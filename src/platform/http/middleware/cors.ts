import cors from "cors";
import type { Request, RequestHandler } from "express";

import { HttpError } from "../errors/http-error.js";

export interface CorsMiddlewareOptions {
  readonly allowedOrigins: readonly string[];
  readonly credentials: boolean;
  readonly maxAgeSeconds?: number;
}

const normalizeOrigin = (origin: string): string => {
  if (origin === "*") {
    return origin;
  }

  return new URL(origin).origin;
};

const isSameOrigin = (origin: string, request: Request): boolean => {
  if (request.host === undefined) {
    return false;
  }

  try {
    return normalizeOrigin(`${request.protocol}://${request.host}`) === origin;
  } catch {
    return false;
  }
};

export function createCorsMiddleware(options: CorsMiddlewareOptions): RequestHandler {
  const origins = new Set(options.allowedOrigins.map(normalizeOrigin));
  const allowAnyOrigin = origins.has("*");

  if (allowAnyOrigin && options.credentials) {
    throw new Error('CORS origin "*" cannot be used with credentials');
  }

  const baseOptions = {
    credentials: options.credentials,
    maxAge: options.maxAgeSeconds ?? 600,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "If-Match", "X-Request-Id"],
    exposedHeaders: ["ETag", "RateLimit", "RateLimit-Policy", "X-Request-Id"],
  };

  return cors<Request>((request, optionsCallback) => {
    optionsCallback(null, {
      ...baseOptions,
      origin(origin, originCallback): void {
        if (origin === undefined || allowAnyOrigin) {
          originCallback(null, true);
          return;
        }

        let normalizedOrigin: string;

        try {
          normalizedOrigin = new URL(origin).origin;
        } catch {
          originCallback(HttpError.forbidden("The request origin is not allowed."));
          return;
        }

        if (isSameOrigin(normalizedOrigin, request) || origins.has(normalizedOrigin)) {
          originCallback(null, true);
          return;
        }

        originCallback(HttpError.forbidden("The request origin is not allowed."));
      },
    });
  });
}
