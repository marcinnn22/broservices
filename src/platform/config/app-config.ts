import { z } from "zod";

export type RuntimeEnvironment = "development" | "test" | "production";
export type LogLevel = "error" | "warn" | "info" | "http" | "debug";
export type TrustProxyConfig = boolean | number | string;
export type MailTransport = "log" | "smtp";
export type RefreshCookieSameSite = "strict" | "lax" | "none";

const maximumTimerDelayMs = 2_147_483_647;
const defaultWebAppUrl = "http://localhost:5173";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly app: {
    readonly name: string;
    readonly version: string;
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly publicUrl?: string;
    readonly apiPrefix: string;
    readonly trustProxy: TrustProxyConfig;
    readonly jsonBodyLimit: string;
    readonly shutdownTimeoutMs: number;
  };
  readonly database: {
    readonly url: string;
    readonly poolMax: number;
    readonly connectionTimeoutMs: number;
    readonly idleTimeoutMs: number;
  };
  readonly auth: {
    readonly accessTokenSecret: string;
    readonly accessTokenTtlSeconds: number;
    readonly refreshSessionTtlMs: number;
    readonly refreshReuseGraceMs: number;
    readonly accessTokenRotationGraceMs: number;
    readonly cleanupIntervalMs: number;
    readonly emailRequestCooldownMs: number;
    readonly emailWorkerPollIntervalMs: number;
    readonly emailVerificationTtlMs: number;
    readonly passwordResetTtlMs: number;
    readonly passwordHash: {
      readonly memoryCostKiB: number;
      readonly timeCost: number;
      readonly parallelism: number;
    };
    readonly issuer: string;
    readonly audience: string;
    readonly webAppUrl: string;
    readonly refreshCookie: {
      readonly name: string;
      readonly secure: boolean;
      readonly sameSite: RefreshCookieSameSite;
      readonly domain?: string;
    };
  };
  readonly cors: {
    readonly allowedOrigins: readonly string[];
    readonly credentials: boolean;
    readonly maxAgeSeconds: number;
  };
  readonly rateLimit: {
    readonly windowMs: number;
    readonly apiLimit: number;
    readonly loginLimit: number;
    readonly refreshLimit: number;
    readonly publicAuthLimit: number;
    readonly monitoringLimit: number;
    readonly emailResendWindowMs: number;
    readonly emailResendIpLimit: number;
    readonly emailResendRecipientLimit: number;
  };
  readonly logging: {
    readonly level: LogLevel;
    readonly pretty: boolean;
    readonly silent: boolean;
  };
  readonly monitoring: {
    readonly serviceName: string;
    readonly metricsEnabled: boolean;
    readonly metricsBearerToken?: string;
    readonly readinessTimeoutMs: number;
    readonly readinessCacheTtlMs: number;
    readonly alertWebhookEnabled: boolean;
    readonly alertWebhookToken?: string;
  };
  readonly docs: {
    readonly enabled: boolean;
    readonly path: string;
  };
  readonly mail: {
    readonly transport: MailTransport;
    readonly from: string;
    readonly host?: string;
    readonly port: number;
    readonly secure: boolean;
    readonly connectionTimeoutMs: number;
    readonly greetingTimeoutMs: number;
    readonly socketTimeoutMs: number;
    readonly user?: string;
    readonly password?: string;
  };
}

export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const details = issues.map(({ path, message }) => `  - ${path}: ${message}`).join("\n");

    super(`Environment configuration is invalid:\n${details}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
    Error.captureStackTrace(this, ConfigValidationError);
  }
}

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const optionalString = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());

const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const optionalBoolean = z.preprocess((value) => {
  const normalized = emptyStringToUndefined(value);

  if (typeof normalized !== "string") {
    return normalized;
  }

  if (normalized.toLowerCase() === "true") {
    return true;
  }

  if (normalized.toLowerCase() === "false") {
    return false;
  }

  return normalized;
}, z.boolean().optional());

const booleanWithDefault = (defaultValue: boolean) =>
  z.preprocess((value) => {
    const normalized = emptyStringToUndefined(value);

    if (normalized === undefined) {
      return defaultValue;
    }

    if (typeof normalized === "string") {
      if (normalized.toLowerCase() === "true") {
        return true;
      }

      if (normalized.toLowerCase() === "false") {
        return false;
      }
    }

    return normalized;
  }, z.boolean());

const integerFromEnv = (defaultValue: number, minimum: number, maximum: number) =>
  z.preprocess((value) => {
    const normalized = emptyStringToUndefined(value);
    return normalized === undefined ? defaultValue : normalized;
  }, z.coerce.number().int().min(minimum).max(maximum));

const trustProxySchema = z.preprocess(
  (value) => {
    const normalized = emptyStringToUndefined(value);

    if (normalized === undefined || normalized === "false") {
      return false;
    }

    if (normalized === "true") {
      return true;
    }

    if (typeof normalized === "string" && /^\d+$/.test(normalized.trim())) {
      return Number(normalized);
    }

    return normalized;
  },
  z.union([z.boolean(), z.number().int().nonnegative(), z.string().min(1)]),
);

const commaSeparatedOrigins = z.preprocess(
  (value) => {
    const normalized = emptyStringToUndefined(value);

    if (normalized === undefined) {
      return ["http://localhost:5173"];
    }

    if (Array.isArray(normalized)) {
      return normalized;
    }

    if (typeof normalized === "string") {
      return normalized
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    }

    return normalized;
  },
  z.array(z.union([z.literal("*"), z.string().url()])).min(1),
);

const durationSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:ms|s|m|h|d)$/, "must be a duration such as 15m, 1h, or 7d")
  .refine((value) => {
    try {
      durationToMilliseconds(value);
      return true;
    } catch {
      return false;
    }
  }, "must be a positive duration within JavaScript's safe integer range");

const durationMillisecondsOrUndefined = (value: string): number | undefined => {
  try {
    return durationToMilliseconds(value);
  } catch {
    return undefined;
  }
};

const rawEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_NAME: z.string().trim().min(1).default("Express API"),
    APP_VERSION: z.string().trim().min(1).default("1.0.0"),

    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: integerFromEnv(4300, 1, 65_535),
    PUBLIC_URL: optionalUrl,
    API_PREFIX: z
      .string()
      .trim()
      .regex(/^\/(?:[A-Za-z0-9._~-]+\/?)*$/, "must be an absolute URL path")
      .default("/api/v1"),
    TRUST_PROXY: trustProxySchema,
    JSON_BODY_LIMIT: z.string().trim().min(1).default("100kb"),
    SHUTDOWN_TIMEOUT_MS: integerFromEnv(10_000, 1_000, 120_000),

    DATABASE_URL: z
      .string()
      .trim()
      .url()
      .refine(
        (url) => /^postgres(?:ql)?:\/\//i.test(url),
        "must use the postgres:// or postgresql:// scheme",
      ),
    DATABASE_POOL_MAX: integerFromEnv(10, 1, 100),
    DATABASE_CONNECTION_TIMEOUT_MS: integerFromEnv(5_000, 100, 60_000),
    DATABASE_IDLE_TIMEOUT_MS: integerFromEnv(30_000, 1_000, 600_000),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: durationSchema.default("15m"),
    REFRESH_SESSION_TTL: durationSchema.default("7d"),
    REFRESH_REUSE_GRACE: durationSchema.default("5s"),
    ACCESS_TOKEN_ROTATION_GRACE: durationSchema.default("30s"),
    AUTH_CLEANUP_INTERVAL: durationSchema.default("1h"),
    AUTH_EMAIL_REQUEST_COOLDOWN: durationSchema.default("20m"),
    AUTH_EMAIL_WORKER_POLL_INTERVAL: durationSchema.default("1s"),
    EMAIL_VERIFICATION_TTL: durationSchema.default("24h"),
    PASSWORD_RESET_TTL: durationSchema.default("1h"),
    ARGON2_MEMORY_COST_KIB: integerFromEnv(19_456, 8_192, 1_048_576),
    ARGON2_TIME_COST: integerFromEnv(2, 1, 10),
    ARGON2_PARALLELISM: integerFromEnv(1, 1, 16),
    JWT_ISSUER: z.string().trim().min(1).default("express-api"),
    JWT_AUDIENCE: z.string().trim().min(1).default("express-api-client"),
    WEB_APP_URL: optionalUrl,
    REFRESH_COOKIE_NAME: z.string().trim().min(1).default("refresh_token"),
    REFRESH_COOKIE_SECURE: optionalBoolean,
    REFRESH_COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),
    REFRESH_COOKIE_DOMAIN: optionalString,

    CORS_ORIGINS: commaSeparatedOrigins,
    CORS_CREDENTIALS: booleanWithDefault(true),
    CORS_MAX_AGE_SECONDS: integerFromEnv(600, 0, 86_400),

    RATE_LIMIT_WINDOW_MS: integerFromEnv(15 * 60_000, 1_000, 86_400_000),
    RATE_LIMIT_API_MAX: integerFromEnv(100, 1, 1_000_000),
    RATE_LIMIT_LOGIN_MAX: integerFromEnv(10, 1, 100_000),
    RATE_LIMIT_REFRESH_MAX: integerFromEnv(50, 1, 100_000),
    RATE_LIMIT_PUBLIC_AUTH_MAX: integerFromEnv(10, 1, 100_000),
    RATE_LIMIT_MONITORING_MAX: integerFromEnv(300, 1, 1_000_000),
    RATE_LIMIT_EMAIL_RESEND_WINDOW_MS: integerFromEnv(60 * 60_000, 1_000, 86_400_000),
    RATE_LIMIT_EMAIL_RESEND_IP_MAX: integerFromEnv(3, 1, 100),
    RATE_LIMIT_EMAIL_RESEND_RECIPIENT_MAX: integerFromEnv(1, 1, 100),

    LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
    LOG_PRETTY: optionalBoolean,
    LOG_SILENT: booleanWithDefault(false),

    METRICS_ENABLED: booleanWithDefault(true),
    METRICS_BEARER_TOKEN: z.preprocess(emptyStringToUndefined, z.string().min(32).optional()),
    READINESS_TIMEOUT_MS: integerFromEnv(2_000, 100, 30_000),
    READINESS_CACHE_TTL_MS: integerFromEnv(1_000, 100, 30_000),
    ALERT_WEBHOOK_ENABLED: optionalBoolean,
    ALERT_WEBHOOK_TOKEN: z.preprocess(emptyStringToUndefined, z.string().min(32).optional()),

    API_DOCS_ENABLED: optionalBoolean,
    API_DOCS_PATH: z
      .string()
      .trim()
      .regex(/^\/[A-Za-z0-9/_-]*$/, "must be an absolute URL path")
      .default("/docs"),

    MAIL_TRANSPORT: z.enum(["log", "smtp"]).optional(),
    MAIL_FROM: z.string().trim().min(1).default("noreply@localhost"),
    SMTP_HOST: optionalString,
    SMTP_PORT: integerFromEnv(587, 1, 65_535),
    SMTP_SECURE: booleanWithDefault(false),
    SMTP_CONNECTION_TIMEOUT_MS: integerFromEnv(5_000, 100, 60_000),
    SMTP_GREETING_TIMEOUT_MS: integerFromEnv(5_000, 100, 60_000),
    SMTP_SOCKET_TIMEOUT_MS: integerFromEnv(5_000, 100, 60_000),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
  })
  .superRefine((value, context) => {
    if (value.CORS_CREDENTIALS && value.CORS_ORIGINS.includes("*")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: 'cannot contain "*" when CORS_CREDENTIALS is true',
      });
    }

    if (value.REFRESH_COOKIE_SAME_SITE === "none" && value.CORS_ORIGINS.includes("*")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: 'cannot contain "*" when REFRESH_COOKIE_SAME_SITE is "none"',
      });
    }

    if (value.NODE_ENV === "production" && value.PUBLIC_URL === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_URL"],
        message: "is required in production",
      });
    }

    if (value.NODE_ENV === "production" && value.WEB_APP_URL === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEB_APP_URL"],
        message: "is required in production",
      });
    }

    const refreshCookieSecure = value.REFRESH_COOKIE_SECURE ?? value.NODE_ENV === "production";

    if (value.NODE_ENV === "production" && !refreshCookieSecure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REFRESH_COOKIE_SECURE"],
        message: "must be true in production",
      });
    }

    if (value.REFRESH_COOKIE_SAME_SITE === "none" && !refreshCookieSecure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REFRESH_COOKIE_SECURE"],
        message: 'must be true when REFRESH_COOKIE_SAME_SITE is "none"',
      });
    }

    if (value.NODE_ENV === "production" && value.TRUST_PROXY === true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message: "must use an explicit proxy hop count or subnet instead of true in production",
      });
    }

    const alertWebhookEnabled =
      value.ALERT_WEBHOOK_ENABLED ?? value.ALERT_WEBHOOK_TOKEN !== undefined;

    if (value.METRICS_ENABLED && value.METRICS_BEARER_TOKEN === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["METRICS_BEARER_TOKEN"],
        message: "is required when METRICS_ENABLED is true",
      });
    }

    const refreshReuseGraceMs = durationMillisecondsOrUndefined(value.REFRESH_REUSE_GRACE);
    if (refreshReuseGraceMs !== undefined && refreshReuseGraceMs > 30_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REFRESH_REUSE_GRACE"],
        message: "must not exceed 30s",
      });
    }

    const accessTokenTtlMs = durationMillisecondsOrUndefined(value.JWT_ACCESS_TTL);
    if (
      accessTokenTtlMs !== undefined &&
      (accessTokenTtlMs < 60_000 || accessTokenTtlMs % 1_000 !== 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_TTL"],
        message: "must be at least 1m and resolve to a whole number of seconds",
      });
    }

    const accessTokenRotationGraceMs = durationMillisecondsOrUndefined(
      value.ACCESS_TOKEN_ROTATION_GRACE,
    );
    if (
      accessTokenRotationGraceMs !== undefined &&
      accessTokenTtlMs !== undefined &&
      (accessTokenRotationGraceMs > 5 * 60_000 || accessTokenRotationGraceMs > accessTokenTtlMs)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ACCESS_TOKEN_ROTATION_GRACE"],
        message: "must not exceed 5m or the access-token lifetime",
      });
    }

    const emailWorkerPollIntervalMs = durationMillisecondsOrUndefined(
      value.AUTH_EMAIL_WORKER_POLL_INTERVAL,
    );
    if (
      emailWorkerPollIntervalMs !== undefined &&
      (emailWorkerPollIntervalMs < 250 || emailWorkerPollIntervalMs > 60_000)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_EMAIL_WORKER_POLL_INTERVAL"],
        message: "must be between 250ms and 1m",
      });
    }

    const cleanupIntervalMs = durationMillisecondsOrUndefined(value.AUTH_CLEANUP_INTERVAL);
    if (cleanupIntervalMs !== undefined && cleanupIntervalMs > maximumTimerDelayMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_CLEANUP_INTERVAL"],
        message: "must not exceed the maximum supported timer delay",
      });
    }

    const emailRequestCooldownMs = durationMillisecondsOrUndefined(
      value.AUTH_EMAIL_REQUEST_COOLDOWN,
    );
    if (
      emailRequestCooldownMs !== undefined &&
      (emailRequestCooldownMs < 60_000 || emailRequestCooldownMs > 86_400_000)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_EMAIL_REQUEST_COOLDOWN"],
        message: "must be between 1m and 1d",
      });
    }

    if (alertWebhookEnabled && value.ALERT_WEBHOOK_TOKEN === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALERT_WEBHOOK_TOKEN"],
        message: "is required when ALERT_WEBHOOK_ENABLED is true",
      });
    }

    const mailTransport =
      value.MAIL_TRANSPORT ?? (value.NODE_ENV === "production" ? "smtp" : "log");

    if (value.NODE_ENV === "production" && mailTransport !== "smtp") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_TRANSPORT"],
        message: "must be smtp in production",
      });
    }

    if (mailTransport === "smtp" && value.SMTP_HOST === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_HOST"],
        message: "is required when MAIL_TRANSPORT is smtp",
      });
    }

    if (mailTransport === "smtp") {
      for (const [path, timeoutMs] of [
        ["SMTP_CONNECTION_TIMEOUT_MS", value.SMTP_CONNECTION_TIMEOUT_MS],
        ["SMTP_GREETING_TIMEOUT_MS", value.SMTP_GREETING_TIMEOUT_MS],
        ["SMTP_SOCKET_TIMEOUT_MS", value.SMTP_SOCKET_TIMEOUT_MS],
      ] as const) {
        if (timeoutMs >= value.SHUTDOWN_TIMEOUT_MS) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message: "must be shorter than SHUTDOWN_TIMEOUT_MS",
          });
        }
      }
    }

    const hasSmtpUser = value.SMTP_USER !== undefined;
    const hasSmtpPassword = value.SMTP_PASSWORD !== undefined;

    if (hasSmtpUser !== hasSmtpPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasSmtpUser ? "SMTP_PASSWORD" : "SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD must be configured together",
      });
    }
  });

const withoutTrailingSlash = (path: string): string =>
  path.length > 1 ? path.replace(/\/+$/, "") : path;

const durationUnitsInMilliseconds = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function durationToMilliseconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);

  if (match === null) {
    throw new RangeError(`Invalid duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof durationUnitsInMilliseconds;
  const milliseconds = amount * durationUnitsInMilliseconds[unit];

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new RangeError(`Duration is outside the supported range: ${value}`);
  }

  return milliseconds;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = rawEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join(".") || "environment",
        message: issue.message,
      })),
    );
  }

  const value = result.data;
  const alertWebhookEnabled =
    value.ALERT_WEBHOOK_ENABLED ?? value.ALERT_WEBHOOK_TOKEN !== undefined;
  const mailTransport = value.MAIL_TRANSPORT ?? (value.NODE_ENV === "production" ? "smtp" : "log");

  return {
    environment: value.NODE_ENV,
    app: {
      name: value.APP_NAME,
      version: value.APP_VERSION,
    },
    server: {
      host: value.HOST,
      port: value.PORT,
      ...(value.PUBLIC_URL === undefined
        ? {}
        : { publicUrl: value.PUBLIC_URL.replace(/\/+$/, "") }),
      apiPrefix: withoutTrailingSlash(value.API_PREFIX),
      trustProxy: value.TRUST_PROXY,
      jsonBodyLimit: value.JSON_BODY_LIMIT,
      shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
    },
    database: {
      url: value.DATABASE_URL,
      poolMax: value.DATABASE_POOL_MAX,
      connectionTimeoutMs: value.DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeoutMs: value.DATABASE_IDLE_TIMEOUT_MS,
    },
    auth: {
      accessTokenSecret: value.JWT_ACCESS_SECRET,
      accessTokenTtlSeconds: durationToMilliseconds(value.JWT_ACCESS_TTL) / 1_000,
      refreshSessionTtlMs: durationToMilliseconds(value.REFRESH_SESSION_TTL),
      refreshReuseGraceMs: durationToMilliseconds(value.REFRESH_REUSE_GRACE),
      accessTokenRotationGraceMs: durationToMilliseconds(value.ACCESS_TOKEN_ROTATION_GRACE),
      cleanupIntervalMs: durationToMilliseconds(value.AUTH_CLEANUP_INTERVAL),
      emailRequestCooldownMs: durationToMilliseconds(value.AUTH_EMAIL_REQUEST_COOLDOWN),
      emailWorkerPollIntervalMs: durationToMilliseconds(value.AUTH_EMAIL_WORKER_POLL_INTERVAL),
      emailVerificationTtlMs: durationToMilliseconds(value.EMAIL_VERIFICATION_TTL),
      passwordResetTtlMs: durationToMilliseconds(value.PASSWORD_RESET_TTL),
      passwordHash: {
        memoryCostKiB: value.ARGON2_MEMORY_COST_KIB,
        timeCost: value.ARGON2_TIME_COST,
        parallelism: value.ARGON2_PARALLELISM,
      },
      issuer: value.JWT_ISSUER,
      audience: value.JWT_AUDIENCE,
      webAppUrl: (value.WEB_APP_URL ?? defaultWebAppUrl).replace(/\/+$/, ""),
      refreshCookie: {
        name: value.REFRESH_COOKIE_NAME,
        secure: value.REFRESH_COOKIE_SECURE ?? value.NODE_ENV === "production",
        sameSite: value.REFRESH_COOKIE_SAME_SITE,
        ...(value.REFRESH_COOKIE_DOMAIN === undefined
          ? {}
          : { domain: value.REFRESH_COOKIE_DOMAIN }),
      },
    },
    cors: {
      allowedOrigins: Object.freeze([...value.CORS_ORIGINS]),
      credentials: value.CORS_CREDENTIALS,
      maxAgeSeconds: value.CORS_MAX_AGE_SECONDS,
    },
    rateLimit: {
      windowMs: value.RATE_LIMIT_WINDOW_MS,
      apiLimit: value.RATE_LIMIT_API_MAX,
      loginLimit: value.RATE_LIMIT_LOGIN_MAX,
      refreshLimit: value.RATE_LIMIT_REFRESH_MAX,
      publicAuthLimit: value.RATE_LIMIT_PUBLIC_AUTH_MAX,
      monitoringLimit: value.RATE_LIMIT_MONITORING_MAX,
      emailResendWindowMs: value.RATE_LIMIT_EMAIL_RESEND_WINDOW_MS,
      emailResendIpLimit: value.RATE_LIMIT_EMAIL_RESEND_IP_MAX,
      emailResendRecipientLimit: value.RATE_LIMIT_EMAIL_RESEND_RECIPIENT_MAX,
    },
    logging: {
      level: value.LOG_LEVEL,
      pretty: value.LOG_PRETTY ?? value.NODE_ENV === "development",
      silent: value.LOG_SILENT,
    },
    monitoring: {
      serviceName: value.APP_NAME.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
      metricsEnabled: value.METRICS_ENABLED,
      ...(value.METRICS_BEARER_TOKEN === undefined
        ? {}
        : { metricsBearerToken: value.METRICS_BEARER_TOKEN }),
      readinessTimeoutMs: value.READINESS_TIMEOUT_MS,
      readinessCacheTtlMs: value.READINESS_CACHE_TTL_MS,
      alertWebhookEnabled,
      ...(value.ALERT_WEBHOOK_TOKEN === undefined
        ? {}
        : { alertWebhookToken: value.ALERT_WEBHOOK_TOKEN }),
    },
    docs: {
      enabled: value.API_DOCS_ENABLED ?? value.NODE_ENV !== "production",
      path: withoutTrailingSlash(value.API_DOCS_PATH),
    },
    mail: {
      transport: mailTransport,
      from: value.MAIL_FROM,
      ...(value.SMTP_HOST === undefined ? {} : { host: value.SMTP_HOST }),
      port: value.SMTP_PORT,
      secure: value.SMTP_SECURE,
      connectionTimeoutMs: value.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeoutMs: value.SMTP_GREETING_TIMEOUT_MS,
      socketTimeoutMs: value.SMTP_SOCKET_TIMEOUT_MS,
      ...(value.SMTP_USER === undefined ? {} : { user: value.SMTP_USER }),
      ...(value.SMTP_PASSWORD === undefined ? {} : { password: value.SMTP_PASSWORD }),
    },
  };
}
