import type { RequestHandler } from "express";

import { HttpError } from "../../../platform/http/errors/http-error.js";
import type { AuthenticateAccessToken } from "../application/use-cases/authenticate-access-token.js";

const extractBearerToken = (authorization: string | undefined): string | undefined => {
  if (authorization === undefined) {
    return undefined;
  }

  return /^Bearer ([^\s]+)$/i.exec(authorization.trim())?.[1];
};

export function createAuthenticateMiddleware(
  authenticate: AuthenticateAccessToken,
): RequestHandler {
  return async (request, _response, next): Promise<void> => {
    const token = extractBearerToken(request.get("authorization"));

    if (token === undefined) {
      next(HttpError.unauthorized());
      return;
    }

    try {
      request.principal = await authenticate.execute(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePrincipal(request: Express.Request) {
  if (request.principal === undefined) {
    throw HttpError.unauthorized();
  }

  return request.principal;
}
