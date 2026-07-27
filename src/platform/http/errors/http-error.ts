export type HttpErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR"
  | (string & {});

export interface HttpErrorOptions {
  readonly statusCode: number;
  readonly code: HttpErrorCode;
  readonly message: string;
  readonly details?: unknown;
  readonly exposeDetails?: boolean;
  readonly cause?: unknown;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: HttpErrorCode;
  readonly details?: unknown;
  readonly exposeDetails: boolean;
  readonly operational = true;

  constructor(options: HttpErrorOptions) {
    if (
      !Number.isInteger(options.statusCode) ||
      options.statusCode < 400 ||
      options.statusCode > 599
    ) {
      throw new RangeError("HttpError statusCode must be an integer between 400 and 599");
    }

    super(options.message, { cause: options.cause });
    this.name = "HttpError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.exposeDetails = options.exposeDetails ?? false;
    Error.captureStackTrace(this, HttpError);
  }

  static badRequest(message = "The request is invalid.", details?: unknown): HttpError {
    return new HttpError({
      statusCode: 400,
      code: "BAD_REQUEST",
      message,
      details,
      exposeDetails: details !== undefined,
    });
  }

  static unauthorized(message = "Authentication is required."): HttpError {
    return new HttpError({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message,
    });
  }

  static forbidden(message = "You are not allowed to perform this action."): HttpError {
    return new HttpError({
      statusCode: 403,
      code: "FORBIDDEN",
      message,
    });
  }

  static notFound(message = "The requested resource was not found."): HttpError {
    return new HttpError({
      statusCode: 404,
      code: "NOT_FOUND",
      message,
    });
  }

  static conflict(message: string, details?: unknown): HttpError {
    return new HttpError({
      statusCode: 409,
      code: "CONFLICT",
      message,
      details,
      exposeDetails: details !== undefined,
    });
  }

  static serviceUnavailable(message = "The service is temporarily unavailable."): HttpError {
    return new HttpError({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message,
    });
  }
}

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;
