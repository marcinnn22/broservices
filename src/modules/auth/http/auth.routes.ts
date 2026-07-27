import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import type { RefreshCookieSameSite } from "../../../platform/config/app-config.js";
import { HttpError } from "../../../platform/http/errors/http-error.js";
import {
  getValidatedRequest,
  type RateLimiters,
  response,
  validateRequest,
} from "../../../platform/http/index.js";
import type {
  Login,
  Logout,
  LogoutAll,
  RefreshAuthSession,
  RegisterUser,
  RequestPasswordReset,
  ResendVerificationEmail,
  ResetPassword,
  SessionMetadata,
  VerifyEmail,
} from "../index.js";
import { requirePrincipal } from "./auth.middleware.js";
import {
  type EmailRequest,
  emailRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type RegisterRequest,
  type ResetPasswordRequest,
  registerRequestSchema,
  resetPasswordRequestSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
} from "./auth.schemas.js";

export interface AuthRouterUseCases {
  readonly register: RegisterUser;
  readonly login: Login;
  readonly refresh: RefreshAuthSession;
  readonly logout: Logout;
  readonly logoutAll: LogoutAll;
  readonly verifyEmail: VerifyEmail;
  readonly resendVerificationEmail: ResendVerificationEmail;
  readonly requestPasswordReset: RequestPasswordReset;
  readonly resetPassword: ResetPassword;
}

export interface AuthRouterOptions {
  readonly useCases: AuthRouterUseCases;
  readonly authenticate: RequestHandler;
  readonly rateLimiters: Pick<RateLimiters, "emailResend" | "login" | "publicAuth" | "refresh">;
  readonly refreshCookie: {
    readonly name: string;
    readonly path: string;
    readonly secure: boolean;
    readonly sameSite: RefreshCookieSameSite;
    readonly domain?: string;
  };
}

const sessionMetadata = (request: Request): SessionMetadata => {
  const ipAddress = request.ip;
  const userAgent = request.get("user-agent");

  return {
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
};

const cookieOptions = (
  options: AuthRouterOptions["refreshCookie"],
  expiresAt?: Date,
): CookieOptions => ({
  httpOnly: true,
  secure: options.secure,
  sameSite: options.sameSite,
  path: options.path,
  ...(options.domain === undefined ? {} : { domain: options.domain }),
  ...(expiresAt === undefined ? {} : { expires: expiresAt }),
});

const readRefreshToken = (request: Request, name: string): string | undefined => {
  const value: unknown = request.cookies?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const sendSession = (
  httpResponse: Response,
  result: Awaited<ReturnType<Login["execute"]>>,
  options: AuthRouterOptions["refreshCookie"],
): void => {
  httpResponse.cookie(
    options.name,
    result.refreshToken,
    cookieOptions(options, result.refreshTokenExpiresAt),
  );
  response.ok(httpResponse, {
    user: result.user,
    accessToken: result.accessToken,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
  });
};

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const { useCases } = options;

  router.post(
    "/register",
    options.rateLimiters.publicAuth,
    validateRequest(registerRequestSchema),
    async (_request, httpResponse) => {
      const { body } = getValidatedRequest<RegisterRequest>(httpResponse);
      const user = await useCases.register.execute(body);
      response.created(httpResponse, { user });
    },
  );

  router.post(
    "/login",
    options.rateLimiters.login,
    validateRequest(loginRequestSchema),
    async (request, httpResponse) => {
      const { body } = getValidatedRequest<LoginRequest>(httpResponse);
      const result = await useCases.login.execute({
        ...body,
        ...sessionMetadata(request),
      });
      sendSession(httpResponse, result, options.refreshCookie);
    },
  );

  router.post("/refresh", options.rateLimiters.refresh, async (request, httpResponse) => {
    const refreshToken = readRefreshToken(request, options.refreshCookie.name);

    if (refreshToken === undefined) {
      throw HttpError.unauthorized("A refresh-token cookie is required.");
    }

    const result = await useCases.refresh.execute({
      refreshToken,
      ...sessionMetadata(request),
    });
    sendSession(httpResponse, result, options.refreshCookie);
  });

  router.post("/logout", async (request, httpResponse) => {
    const refreshToken = readRefreshToken(request, options.refreshCookie.name);

    if (refreshToken !== undefined) {
      await useCases.logout.execute(refreshToken);
    }

    httpResponse.clearCookie(options.refreshCookie.name, cookieOptions(options.refreshCookie));
    response.accepted(httpResponse, { accepted: true });
  });

  router.post("/logout-all", options.authenticate, async (request, httpResponse) => {
    await useCases.logoutAll.execute(requirePrincipal(request));
    httpResponse.clearCookie(options.refreshCookie.name, cookieOptions(options.refreshCookie));
    response.accepted(httpResponse, { accepted: true });
  });

  router.post(
    "/email/verify",
    options.rateLimiters.publicAuth,
    validateRequest(verifyEmailRequestSchema),
    async (_request, httpResponse) => {
      const { body } = getValidatedRequest<VerifyEmailRequest>(httpResponse);
      const user = await useCases.verifyEmail.execute(body.token);
      response.ok(httpResponse, { user });
    },
  );

  router.post(
    "/email/resend",
    ...options.rateLimiters.emailResend,
    options.rateLimiters.publicAuth,
    validateRequest(emailRequestSchema),
    async (_request, httpResponse) => {
      const { body } = getValidatedRequest<EmailRequest>(httpResponse);
      const result = await useCases.resendVerificationEmail.execute(body.email);
      response.accepted(httpResponse, result);
    },
  );

  router.post(
    "/password/forgot",
    options.rateLimiters.publicAuth,
    validateRequest(emailRequestSchema),
    async (_request, httpResponse) => {
      const { body } = getValidatedRequest<EmailRequest>(httpResponse);
      const result = await useCases.requestPasswordReset.execute(body.email);
      response.accepted(httpResponse, result);
    },
  );

  router.post(
    "/password/reset",
    options.rateLimiters.publicAuth,
    validateRequest(resetPasswordRequestSchema),
    async (_request, httpResponse) => {
      const { body } = getValidatedRequest<ResetPasswordRequest>(httpResponse);
      const result = await useCases.resetPassword.execute(body);
      httpResponse.clearCookie(options.refreshCookie.name, cookieOptions(options.refreshCookie));
      response.accepted(httpResponse, result);
    },
  );

  return router;
}
