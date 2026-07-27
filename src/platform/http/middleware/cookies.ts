import cookieParser from "cookie-parser";
import type { RequestHandler } from "express";

/**
 * Parses unsigned cookies. Refresh-token integrity comes from the opaque,
 * server-side hashed session record rather than a client-side cookie signature.
 */
export function createCookieParserMiddleware(): RequestHandler {
  return cookieParser();
}
