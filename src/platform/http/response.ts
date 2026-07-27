import type { Response } from "express";

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly requestId: string;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly requestId: string;
}

export interface SuccessResponseOptions<T> {
  readonly statusCode?: number;
  readonly data: T;
  readonly meta?: Readonly<Record<string, unknown>>;
}

const responseRequestId = (response: Response): string => {
  const requestId = response.locals.requestId;
  return typeof requestId === "string" ? requestId : "unknown";
};

export function sendSuccess<T>(response: Response, options: SuccessResponseOptions<T>): void {
  const body: ApiSuccess<T> = {
    success: true,
    data: options.data,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    requestId: responseRequestId(response),
  };

  response.status(options.statusCode ?? 200).json(body);
}

export function sendError(
  response: Response,
  options: {
    readonly statusCode: number;
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  },
): void {
  const body: ApiFailure = {
    success: false,
    error: {
      code: options.code,
      message: options.message,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
    requestId: responseRequestId(response),
  };

  response.status(options.statusCode).json(body);
}

export const response = {
  ok<T>(httpResponse: Response, data: T): void {
    sendSuccess(httpResponse, { data });
  },

  created<T>(httpResponse: Response, data: T): void {
    sendSuccess(httpResponse, { statusCode: 201, data });
  },

  accepted<T>(httpResponse: Response, data: T): void {
    sendSuccess(httpResponse, { statusCode: 202, data });
  },

  noContent(httpResponse: Response): void {
    httpResponse.status(204).send();
  },
} as const;
