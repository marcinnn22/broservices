import pino from "pino";

import type { LogLevel, RuntimeEnvironment } from "../config/app-config.js";
import { getRequestContext } from "./request-context.js";

export interface Logger {
  debug(message: string, metadata?: unknown): void;
  info(message: string, metadata?: unknown): void;
  warn(message: string, metadata?: unknown): void;
  error(message: string, metadata?: unknown): void;
  flush(): void;
}

export interface LoggerOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: RuntimeEnvironment;
  readonly level: LogLevel;
  readonly pretty?: boolean;
  readonly silent?: boolean;
}

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;
const sensitiveKeyPattern =
  /^(?:authorization|proxyauthorization|cookie|setcookie|password|passwd|passwordhash|secret|token|accesstoken|refreshtoken|idtoken|apikey|xapikey|clientsecret|credential|params|parameters|otp|pin)$/i;

const normalizeKey = (key: string): string => key.replace(/[-_.\s[\]]/g, "");
const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key).toLowerCase();

  return (
    sensitiveKeyPattern.test(normalized) ||
    normalized.includes("password") ||
    normalized.endsWith("token") ||
    normalized.endsWith("tokenhash") ||
    normalized.endsWith("secret")
  );
};

const redactUrl = (value: string): string => {
  try {
    const isAbsolute = /^[A-Za-z][A-Za-z\d+.-]*:/.test(value);
    const url = new URL(value, "http://redaction.invalid");

    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }

    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

const isUrlKey = (key: string): boolean => {
  const normalized = normalizeKey(key).toLowerCase();
  return normalized === "url" || normalized === "originalurl" || normalized === "requesturl";
};

const redactEmbeddedSqlParameters = (value: string): string =>
  value.replace(
    /^(\s*(?:params|parameters)\s*:).*$/gim,
    (_match, prefix: string) => `${prefix} ${REDACTED}`,
  );

function redactValue(value: unknown, key: string, seen: WeakSet<object>, depth: number): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactEmbeddedSqlParameters(isUrlKey(key) ? redactUrl(value) : value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }

  if (depth >= MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  try {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactEmbeddedSqlParameters(value.message),
        ...(value.stack === undefined ? {} : { stack: redactEmbeddedSqlParameters(value.stack) }),
        ...(value.cause === undefined
          ? {}
          : { cause: redactValue(value.cause, "cause", seen, depth + 1) }),
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, key, seen, depth + 1));
    }

    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey, seen, depth + 1),
      ]),
    );
  } finally {
    seen.delete(value);
  }
}

export const sanitizeLogMetadata = (metadata: unknown): Record<string, unknown> => {
  if (metadata === undefined) {
    return {};
  }

  const redacted = redactValue(metadata, "metadata", new WeakSet<object>(), 0);
  return typeof redacted === "object" && redacted !== null && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : { value: redacted };
};

export function createLogger(options: LoggerOptions): Logger {
  const raw = pino({
    name: options.serviceName,
    level: options.level === "http" ? "info" : options.level,
    enabled: !(options.silent ?? false),
    base: {
      service: options.serviceName,
      version: options.serviceVersion,
      environment: options.environment,
    },
    mixin(): Record<string, unknown> {
      const context = getRequestContext();
      return context === undefined ? {} : { requestId: context.requestId };
    },
    ...(options.pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: true,
              translateTime: "SYS:standard",
            },
          },
        }
      : {}),
  });

  const write = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: unknown,
  ): void => {
    if (!raw.isLevelEnabled(level)) {
      return;
    }

    raw[level](sanitizeLogMetadata(metadata), redactEmbeddedSqlParameters(message));
  };

  return {
    debug: (message, metadata): void => write("debug", message, metadata),
    info: (message, metadata): void => write("info", message, metadata),
    warn: (message, metadata): void => write("warn", message, metadata),
    error: (message, metadata): void => write("error", message, metadata),
    flush: (): void => raw.flush(),
  };
}
