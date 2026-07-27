import type { RequestHandler, Response } from "express";
import type { z } from "zod";

export const VALIDATED_REQUEST_LOCAL = "validatedRequest";

export function validateRequest<T>(schema: z.ZodType<T>): RequestHandler {
  return (request, response, next): void => {
    const result = schema.safeParse({
      body: request.body ?? {},
      params: request.params,
      query: request.query,
      headers: request.headers,
    });

    if (!result.success) {
      next(result.error);
      return;
    }

    response.locals[VALIDATED_REQUEST_LOCAL] = result.data;
    next();
  };
}

export function getValidatedRequest<T>(response: Response): T {
  return response.locals[VALIDATED_REQUEST_LOCAL] as T;
}
