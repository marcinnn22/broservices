import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

import { runWithRequestContext } from "../../observability/request-context.js";

export interface RequestIdMiddlewareOptions {
  readonly headerName?: string;
  readonly acceptIncoming?: boolean;
}

const validRequestId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export function createRequestIdMiddleware(
  options: RequestIdMiddlewareOptions = {},
): RequestHandler {
  const headerName = (options.headerName ?? "x-request-id").toLowerCase();
  const acceptIncoming = options.acceptIncoming ?? true;

  return (request, response, next): void => {
    const candidate = acceptIncoming ? request.get(headerName)?.trim() : undefined;
    const requestId =
      candidate !== undefined && validRequestId.test(candidate) ? candidate : randomUUID();

    request.id = requestId;
    request.requestId = requestId;
    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    runWithRequestContext({ requestId }, next);
  };
}
