import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

import {
  Argon2PasswordHasher,
  type AuthEmailRequestWorker,
  type AuthLifetimes,
  type AuthMaintenance,
  authOpenApi,
  createAuthEmailRequestWorker,
  createAuthenticateMiddleware,
  createAuthMaintenance,
  createAuthRouter,
  createAuthUseCases,
  DrizzleAuthActionTokenRepository,
  DrizzleAuthEmailRequestRepository,
  DrizzleRefreshSessionRepository,
  JoseAccessTokenService,
  NodeIdGenerator,
  NodemailerAuthEmailSender,
  NodeOpaqueTokenService,
  SystemClock,
} from "../modules/auth/index.js";
import {
  createHealthService,
  createLoggingAlertWebhook,
  createMonitoringRouter,
  monitoringOpenApi,
} from "../modules/monitoring/index.js";
import {
  createUsersRouter,
  createUserUseCases,
  DrizzleUserRepository,
  usersOpenApi,
} from "../modules/users/index.js";
import type { AppConfig } from "../platform/config/index.js";
import { createDatabase, type DatabaseConnection } from "../platform/database/index.js";
import {
  createHttpMiddleware,
  createOpenApiDocument,
  createOpenApiRouter,
  joinHttpPath,
  type OpenApiFragment,
} from "../platform/http/index.js";
import {
  type ApplicationMetrics,
  createLogger,
  createMetrics,
  type Logger,
} from "../platform/observability/index.js";
import { createApp } from "./create-app.js";
import { applicationErrorMapper } from "./error-mappers.js";

export interface ApplicationRuntime {
  readonly app: ReturnType<typeof createApp>;
  readonly config: AppConfig;
  readonly database: DatabaseConnection;
  readonly logger: Logger;
  readonly metrics: ApplicationMetrics;
  close(): Promise<void>;
}

interface OwnedResources {
  authEmailWorker?: AuthEmailRequestWorker;
  authMaintenance?: AuthMaintenance;
  mailTransporter?: Transporter;
  database?: DatabaseConnection;
  metrics?: ApplicationMetrics;
  logger?: Logger;
}

const prefixPaths = (fragment: OpenApiFragment, prefix: string): OpenApiFragment => ({
  ...fragment,
  ...(fragment.paths === undefined
    ? {}
    : {
        paths: Object.fromEntries(
          Object.entries(fragment.paths).map(([path, operation]) => [
            joinHttpPath(prefix, path),
            operation,
          ]),
        ),
      }),
});

const actionUrl = (baseUrl: string, pathname: string, token: string): string => {
  const url = new URL(pathname, `${baseUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
};

const createMailTransporter = (config: AppConfig): Transporter => {
  if (config.mail.transport === "log") {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    connectionTimeout: config.mail.connectionTimeoutMs,
    greetingTimeout: config.mail.greetingTimeoutMs,
    socketTimeout: config.mail.socketTimeoutMs,
    ...(config.mail.user === undefined || config.mail.password === undefined
      ? {}
      : {
          auth: {
            user: config.mail.user,
            pass: config.mail.password,
          },
        }),
  });
};

const closeOwnedResources = async (resources: OwnedResources): Promise<void> => {
  const errors: unknown[] = [];
  let emailWorkerClose: Promise<void> | undefined;

  if (resources.authEmailWorker !== undefined) {
    try {
      // Calling close synchronously stops future polls before the mail
      // transport is closed. The returned promise may still be draining an
      // active send.
      emailWorkerClose = resources.authEmailWorker.close();
      delete resources.authEmailWorker;
    } catch (error) {
      errors.push(error);
    }
  }

  if (resources.mailTransporter !== undefined) {
    try {
      // Interrupt an active SMTP operation so the worker can finish its retry
      // transition within the process-level shutdown deadline.
      resources.mailTransporter.close();
      delete resources.mailTransporter;
    } catch (error) {
      errors.push(error);
    }
  }

  if (emailWorkerClose !== undefined) {
    try {
      await emailWorkerClose;
    } catch (error) {
      errors.push(error);
    }
  }

  if (resources.authMaintenance !== undefined) {
    try {
      await resources.authMaintenance.close();
      delete resources.authMaintenance;
    } catch (error) {
      errors.push(error);
    }
  }

  if (resources.database !== undefined) {
    try {
      await resources.database.close();
      delete resources.database;
    } catch (error) {
      errors.push(error);
    }
  }

  if (resources.metrics !== undefined) {
    try {
      resources.metrics.close();
      delete resources.metrics;
    } catch (error) {
      errors.push(error);
    }
  }

  if (resources.logger !== undefined) {
    try {
      resources.logger.flush();
      delete resources.logger;
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more application resources failed to close");
  }
};

const createResourceCloser = (resources: OwnedResources): (() => Promise<void>) => {
  let activeClose: Promise<void> | undefined;

  return (): Promise<void> => {
    if (activeClose === undefined) {
      activeClose = closeOwnedResources(resources).finally(() => {
        activeClose = undefined;
      });
    }

    return activeClose;
  };
};

export async function createCompositionRoot(config: AppConfig): Promise<ApplicationRuntime> {
  // Validate synchronous security adapters before allocating process-wide resources.
  const passwords = new Argon2PasswordHasher(config.auth.passwordHash);
  const accessTokens = new JoseAccessTokenService({
    secret: config.auth.accessTokenSecret,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    ttlSeconds: config.auth.accessTokenTtlSeconds,
  });
  const opaqueTokens = new NodeOpaqueTokenService();
  const ids = new NodeIdGenerator();
  const clock = new SystemClock();
  const lifetimes = {
    refreshSessionMs: config.auth.refreshSessionTtlMs,
    refreshReuseGraceMs: config.auth.refreshReuseGraceMs,
    accessTokenRotationGraceMs: config.auth.accessTokenRotationGraceMs,
    emailRequestCooldownMs: config.auth.emailRequestCooldownMs,
    emailVerificationMs: config.auth.emailVerificationTtlMs,
    passwordResetMs: config.auth.passwordResetTtlMs,
  } satisfies AuthLifetimes;
  const resources: OwnedResources = {};
  const closeResources = createResourceCloser(resources);

  try {
    const logger = createLogger({
      serviceName: config.monitoring.serviceName,
      serviceVersion: config.app.version,
      environment: config.environment,
      level: config.logging.level,
      pretty: config.logging.pretty,
      silent: config.logging.silent,
    });
    resources.logger = logger;

    const metrics = createMetrics({
      serviceName: config.monitoring.serviceName,
      collectDefaultMetrics: true,
    });
    resources.metrics = metrics;

    const database = createDatabase({
      connectionString: config.database.url,
      maxConnections: config.database.poolMax,
      connectionTimeoutMs: config.database.connectionTimeoutMs,
      idleTimeoutMs: config.database.idleTimeoutMs,
      applicationName: config.monitoring.serviceName,
      onUnexpectedPoolError(error): void {
        logger.error("Unexpected PostgreSQL pool error", { error });
      },
    });
    resources.database = database;
    await database.ping();

    const users = new DrizzleUserRepository(database.db, metrics);
    const actionTokens = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const emailRequests = new DrizzleAuthEmailRequestRepository(database.db, metrics);
    const sessions = new DrizzleRefreshSessionRepository(database.db, metrics);
    const authMaintenance = createAuthMaintenance({
      refreshSessions: sessions,
      actionTokens,
      clock,
      intervalMs: config.auth.cleanupIntervalMs,
      onCompleted(result): void {
        if (result.refreshSessionsDeleted + result.actionTokensDeleted > 0) {
          logger.info("Expired authentication records deleted", result);
        }
      },
      onError(error): void {
        logger.error("Authentication record cleanup failed", { error });
      },
    });
    resources.authMaintenance = authMaintenance;

    const mailTransporter = createMailTransporter(config);
    resources.mailTransporter = mailTransporter;
    const email = new NodemailerAuthEmailSender({
      transporter: mailTransporter,
      from: config.mail.from,
      productName: config.app.name,
      verificationUrl: (token) => actionUrl(config.auth.webAppUrl, "verify-email", token),
      passwordResetUrl: (token) => actionUrl(config.auth.webAppUrl, "reset-password", token),
    });
    const authEmailWorker = createAuthEmailRequestWorker({
      requests: emailRequests,
      users,
      opaqueTokens,
      actionTokens,
      email,
      clock,
      emailVerificationMs: lifetimes.emailVerificationMs,
      passwordResetMs: lifetimes.passwordResetMs,
      pollIntervalMs: config.auth.emailWorkerPollIntervalMs,
      requestCooldownMs: lifetimes.emailRequestCooldownMs,
      onError(error, request): void {
        logger.error("Authentication email request processing failed", {
          error,
          requestId: request?.id,
          purpose: request?.purpose,
          attempts: request?.attempts,
        });
      },
    });
    resources.authEmailWorker = authEmailWorker;

    const authUseCases = createAuthUseCases({
      users,
      passwords,
      accessTokens,
      opaqueTokens,
      actionTokens,
      emailRequests,
      sessions,
      email,
      ids,
      clock,
      lifetimes,
      onNotificationError(notification, error): void {
        logger.error("Authentication notification delivery failed", {
          notification,
          error,
        });
      },
    });
    const userUseCases = createUserUseCases(users);
    const authenticate = createAuthenticateMiddleware(authUseCases.authenticate);
    const middleware = createHttpMiddleware({
      config,
      logger,
      metrics,
      errorMappers: [applicationErrorMapper],
    });
    const authRouter = createAuthRouter({
      authenticate,
      rateLimiters: middleware.rateLimiters,
      refreshCookie: {
        ...config.auth.refreshCookie,
        path: joinHttpPath(config.server.apiPrefix, "auth"),
      },
      useCases: authUseCases,
    });
    const usersRouter = createUsersRouter({
      authenticate,
      useCases: userUseCases,
    });
    const health = createHealthService({
      checks: [{ name: "postgres", check: (signal) => database.ping(signal) }],
      timeoutMs: config.monitoring.readinessTimeoutMs,
      cacheTtlMs: config.monitoring.readinessCacheTtlMs,
      logger,
    });
    const monitoringRouter = createMonitoringRouter({
      health,
      metrics,
      logger,
      rateLimit: middleware.rateLimiters.monitoring,
      metricsEnabled: config.monitoring.metricsEnabled,
      ...(config.monitoring.metricsBearerToken === undefined
        ? {}
        : { metricsBearerToken: config.monitoring.metricsBearerToken }),
      ...(config.monitoring.alertWebhookEnabled && config.monitoring.alertWebhookToken !== undefined
        ? {
            alertWebhook: {
              token: config.monitoring.alertWebhookToken,
              handle: createLoggingAlertWebhook(logger),
            },
          }
        : {}),
    });
    const docsRouter = config.docs.enabled
      ? createOpenApiRouter({
          document: createOpenApiDocument({
            title: config.app.name,
            version: config.app.version,
            description:
              "A production-oriented Express, PostgreSQL, and Drizzle modular-monolith API.",
            serverUrl: config.server.publicUrl ?? "/",
            fragments: [
              prefixPaths(authOpenApi, config.server.apiPrefix),
              prefixPaths(usersOpenApi, config.server.apiPrefix),
              monitoringOpenApi,
            ],
          }),
        })
      : undefined;
    const app = createApp({
      config,
      middleware,
      authRouter,
      usersRouter,
      monitoringRouter,
      ...(docsRouter === undefined ? {} : { docsRouter }),
    });

    // Drain pre-existing work before accepting traffic, then start both
    // non-overlapping schedules only after every startup step has succeeded.
    await Promise.all([authMaintenance.run(), authEmailWorker.run()]);
    authMaintenance.start();
    authEmailWorker.start();

    return {
      app,
      config,
      database,
      logger,
      metrics,
      close: closeResources,
    };
  } catch (startupError) {
    try {
      await closeResources();
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "Application startup failed and resource cleanup was incomplete",
      );
    }

    throw startupError;
  }
}
