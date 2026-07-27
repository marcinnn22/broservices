import type { RequestHandler } from "express";
import helmet from "helmet";

export interface SecurityMiddlewareOptions {
  readonly production: boolean;
}

export function createSecurityMiddleware(options: SecurityMiddlewareOptions): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: { action: "deny" },
      hsts: options.production
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      referrerPolicy: { policy: "no-referrer" },
      // Explicitly disable the legacy browser XSS auditor. Helmet emits
      // `X-XSS-Protection: 0`, which avoids the auditor's known security bugs.
      xXssProtection: true,
    }),
    (_request, response, next): void => {
      response.setHeader(
        "Permissions-Policy",
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
      );
      next();
    },
  ];
}

export function createDocsSecurityMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
  });
}
