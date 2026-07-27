import type { UserRepository } from "../../users/index.js";
import type { AuthLifetimes } from "./auth-lifetimes.js";
import type { AccessTokenService } from "./ports/access-token-service.js";
import type { AuthActionTokenRepository } from "./ports/auth-action-token-repository.js";
import type { AuthEmailRequestRepository } from "./ports/auth-email-request-repository.js";
import type { AuthEmailSender } from "./ports/auth-email-sender.js";
import type { Clock } from "./ports/clock.js";
import type { IdGenerator } from "./ports/id-generator.js";
import type { OpaqueTokenService } from "./ports/opaque-token-service.js";
import type { PasswordHasher } from "./ports/password-hasher.js";
import type { RefreshSessionRepository } from "./ports/refresh-session-repository.js";
import { AuthenticateAccessToken } from "./use-cases/authenticate-access-token.js";
import { Login } from "./use-cases/login.js";
import { Logout } from "./use-cases/logout.js";
import { LogoutAll } from "./use-cases/logout-all.js";
import { RefreshAuthSession } from "./use-cases/refresh-auth-session.js";
import { RegisterUser } from "./use-cases/register-user.js";
import { RequestPasswordReset } from "./use-cases/request-password-reset.js";
import { ResendVerificationEmail } from "./use-cases/resend-verification-email.js";
import { ResetPassword } from "./use-cases/reset-password.js";
import { VerifyEmail } from "./use-cases/verify-email.js";

export interface AuthUseCaseDependencies {
  users: UserRepository;
  passwords: PasswordHasher;
  accessTokens: AccessTokenService;
  opaqueTokens: OpaqueTokenService;
  actionTokens: AuthActionTokenRepository;
  emailRequests: AuthEmailRequestRepository;
  sessions: RefreshSessionRepository;
  email: AuthEmailSender;
  ids: IdGenerator;
  clock: Clock;
  lifetimes: AuthLifetimes;
  onNotificationError?: (notification: "password_changed", error: unknown) => void;
}

export function createAuthUseCases(dependencies: AuthUseCaseDependencies) {
  const { lifetimes } = dependencies;

  return {
    register: new RegisterUser({
      users: dependencies.users,
      passwords: dependencies.passwords,
      emailRequests: dependencies.emailRequests,
      clock: dependencies.clock,
    }),
    login: new Login({
      users: dependencies.users,
      passwords: dependencies.passwords,
      accessTokens: dependencies.accessTokens,
      opaqueTokens: dependencies.opaqueTokens,
      sessions: dependencies.sessions,
      ids: dependencies.ids,
      clock: dependencies.clock,
      refreshSessionMs: lifetimes.refreshSessionMs,
    }),
    refresh: new RefreshAuthSession({
      users: dependencies.users,
      accessTokens: dependencies.accessTokens,
      opaqueTokens: dependencies.opaqueTokens,
      sessions: dependencies.sessions,
      ids: dependencies.ids,
      clock: dependencies.clock,
      refreshReuseGraceMs: lifetimes.refreshReuseGraceMs,
    }),
    authenticate: new AuthenticateAccessToken({
      users: dependencies.users,
      accessTokens: dependencies.accessTokens,
      sessions: dependencies.sessions,
      clock: dependencies.clock,
      rotationGraceMs: lifetimes.accessTokenRotationGraceMs,
    }),
    logout: new Logout({
      opaqueTokens: dependencies.opaqueTokens,
      sessions: dependencies.sessions,
      clock: dependencies.clock,
    }),
    logoutAll: new LogoutAll({
      users: dependencies.users,
      sessions: dependencies.sessions,
      clock: dependencies.clock,
    }),
    verifyEmail: new VerifyEmail({
      opaqueTokens: dependencies.opaqueTokens,
      actionTokens: dependencies.actionTokens,
      clock: dependencies.clock,
    }),
    resendVerificationEmail: new ResendVerificationEmail({
      requests: dependencies.emailRequests,
      clock: dependencies.clock,
      requestCooldownMs: lifetimes.emailRequestCooldownMs,
    }),
    requestPasswordReset: new RequestPasswordReset({
      requests: dependencies.emailRequests,
      clock: dependencies.clock,
      requestCooldownMs: lifetimes.emailRequestCooldownMs,
    }),
    resetPassword: new ResetPassword({
      users: dependencies.users,
      passwords: dependencies.passwords,
      opaqueTokens: dependencies.opaqueTokens,
      actionTokens: dependencies.actionTokens,
      email: dependencies.email,
      clock: dependencies.clock,
      ...(dependencies.onNotificationError === undefined
        ? {}
        : { onNotificationError: dependencies.onNotificationError }),
    }),
  } as const;
}

export type AuthUseCases = ReturnType<typeof createAuthUseCases>;
