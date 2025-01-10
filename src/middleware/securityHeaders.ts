import helmet from "helmet";
import { Express } from "express";
import { ENV } from "@/config/env";

export const setupSecurityHeaders = (app: Express) => {
  app.use(helmet());
  app.use(helmet.noSniff());
  app.use(helmet.xssFilter());
  app.use(helmet.hidePoweredBy());
  app.disable("x-powered-by");

  app.use(
    helmet.hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    })
  );

  app.use(helmet.frameguard({ action: "deny" }));

  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts if needed
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles if needed
        imgSrc: ["'self'", "data:", "https:"], // Allow data URIs and HTTPS images
        connectSrc: ["'self'", ENV.FRONTEND_URL], // Allow connections to frontend
        fontSrc: ["'self'", "https:", "data:"], // Allow loading fonts
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    })
  );
};
