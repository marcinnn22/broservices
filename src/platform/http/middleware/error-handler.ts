import type { ErrorRequestHandler, Request } from "express";
import { ZodError } from "zod";

import type { Logger } from "../../observability/logger.js";
import { HttpError, isHttpError } from "../errors/http-error.js";
import { sendError } from "../response.js";
import { getRouteTemplate } from "../route-template.js";

export type ErrorMapper = (error: unknown, request: Request) => HttpError | undefined;

export interface ErrorHandlerOptions {
  readonly logger: Logger;
  readonly errorMappers?: readonly ErrorMapper[];
}

interface BodyParserError {
  readonly type?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  typeof error === "object" && error !== null;

const bodyParserErrorTypes = new Set([
  "charset.unsupported",
  "encoding.unsupported",
  "entity.parse.failed",
  "entity.too.large",
  "entity.verify.failed",
  "parameters.too.many",
  "querystring.parse.rangeError",
  "request.aborted",
  "request.size.invalid",
  "stream.encoding.set",
  "stream.not.readable",
]);

const bodyParserClientStatus = (error: BodyParserError): number | undefined => {
  if (typeof error.type !== "string" || !bodyParserErrorTypes.has(error.type)) {
    return undefined;
  }

  const status = error.status ?? error.statusCode;
  return Number.isInteger(status) && Number(status) >= 400 && Number(status) < 500
    ? Number(status)
    : undefined;
};

const bodyParserErrorCode = (statusCode: number): string => {
  if (statusCode === 403) {
    return "FORBIDDEN";
  }
  if (statusCode === 415) {
    return "UNSUPPORTED_MEDIA_TYPE";
  }

  return "BAD_REQUEST";
};

const bodyParserErrorMessage = (statusCode: number): string => {
  if (statusCode === 403) {
    return "The request body could not be verified.";
  }
  if (statusCode === 415) {
    return "The request body uses an unsupported media type or character encoding.";
  }

  return "The request body could not be processed.";
};

const mapBuiltInError = (error: unknown): HttpError => {
  if (isHttpError(error)) {
    return error;
  }

  if (error instanceof ZodError) {
    return new HttpError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "The request contains invalid data.",
      details: {
        issues: error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      exposeDetails: true,
    });
  }

  if (isBodyParserError(error) && error.type === "entity.parse.failed") {
    return new HttpError({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "The request body contains malformed JSON.",
      cause: error,
    });
  }

  if (isBodyParserError(error) && (error.type === "entity.too.large" || error.status === 413)) {
    return new HttpError({
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "The request body is too large.",
      cause: error,
    });
  }

  if (isBodyParserError(error)) {
    const statusCode = bodyParserClientStatus(error);

    if (statusCode !== undefined) {
      return new HttpError({
        statusCode,
        code: bodyParserErrorCode(statusCode),
        message: bodyParserErrorMessage(statusCode),
        cause: error,
      });
    }
  }

  return new HttpError({
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    exposeDetails: false,
    cause: error,
  });
};

const applyErrorMappers = (
  error: unknown,
  request: Request,
  mappers: readonly ErrorMapper[],
): HttpError => {
  for (const mapper of mappers) {
    const mappedError = mapper(error, request);

    if (mappedError !== undefined) {
      return mappedError;
    }
  }

  return mapBuiltInError(error);
};

export function createErrorHandler(options: ErrorHandlerOptions): ErrorRequestHandler {
  const errorMappers = options.errorMappers ?? [];

  return (error, request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    let httpError: HttpError;

    try {
      httpError = applyErrorMappers(error, request, errorMappers);
    } catch (mappingError) {
      options.logger.error("An HTTP error mapper failed", {
        error: mappingError,
        originalError: error,
        requestId: request.requestId,
      });
      httpError = mapBuiltInError(error);
    }

    const requestMetadata = {
      requestId: request.requestId,
      method: request.method,
      route: getRouteTemplate(request),
      statusCode: httpError.statusCode,
      errorCode: httpError.code,
    };

    if (httpError.statusCode >= 500) {
      options.logger.error("HTTP request handler failed", {
        ...requestMetadata,
        error,
      });
    } else {
      options.logger.warn("HTTP request handler rejected a request", requestMetadata);
    }

    sendError(response, {
      statusCode: httpError.statusCode,
      code: httpError.code,
      message: httpError.message,
      ...(httpError.exposeDetails && httpError.details !== undefined
        ? { details: httpError.details }
        : {}),
    });
  };
}
