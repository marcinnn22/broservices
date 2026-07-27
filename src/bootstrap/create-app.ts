import express, { type Express, type RequestHandler, type Router } from "express";

import type { AppConfig } from "../platform/config/index.js";
import type { HttpMiddleware } from "../platform/http/index.js";
import { response } from "../platform/http/index.js";

export interface CreateAppOptions {
  readonly config: AppConfig;
  readonly middleware: HttpMiddleware;
  readonly authRouter: Router;
  readonly usersRouter: Router;
  readonly monitoringRouter: Router;
  readonly docsRouter?: Router;
}

const captureRouteBasePath: RequestHandler = (request, _response, next) => {
  request.routeBasePath = request.baseUrl;
  next();
};

export function createApp(options: CreateAppOptions): Express {
  const { config, middleware } = options;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.server.trustProxy);
  app.use(...middleware.beforeRoutes);

  app.use("/monitoring", captureRouteBasePath, options.monitoringRouter);

  const api = express.Router();
  api.use(captureRouteBasePath);
  api.use(middleware.rateLimiters.api);
  api.get("/", (_request, httpResponse) => {
    response.ok(httpResponse, {
      name: config.app.name,
      version: config.app.version,
      environment: config.environment,
      docs: config.docs.enabled ? config.docs.path : null,
    });
  });
  api.use("/auth", captureRouteBasePath, options.authRouter);
  api.use("/users", captureRouteBasePath, options.usersRouter);
  app.use(config.server.apiPrefix, api);

  if (options.docsRouter !== undefined) {
    app.use(config.docs.path, options.docsRouter);
  }

  app.use(middleware.notFound);
  app.use(middleware.errorHandler);

  return app;
}
